// api/generate.js
export const config = { runtime: "nodejs" };

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { verifyManzaiAssertion } from "../lib/appAttestVerify.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const hasSupabase = !!(SUPABASE_URL && SUPABASE_KEY);

const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

/* =========================
 * 漫才 / コント モード判定 & ユーザーID分離ヘルパー
 * ========================= */

function detectAppMode(body = {}) {
  const explicitMode = String(body.mode || body.app_mode || body.type || "").trim().toLowerCase();
  if (explicitMode === "conte" || explicitMode === "skit" || explicitMode === "コント") {
    return "conte";
  }
  if (explicitMode === "manzai" || explicitMode === "漫才") {
    return "manzai";
  }

  const genre = String(body.genre || "").trim();
  const theme = String(body.theme || "").trim();
  const planType = String(body.plan_type || "").trim().toLowerCase();

  if (
    planType.includes("conte") ||
    genre.includes("コント") ||
    theme.includes("『コント") ||
    theme.includes("コント（寸劇）")
  ) {
    return "conte";
  }

  const allTechs = [
    ...(Array.isArray(body.boke) ? body.boke : []),
    ...(Array.isArray(body.tsukkomi) ? body.tsukkomi : []),
    ...(Array.isArray(body.general) ? body.general : [])
  ].join(" ");

  if (/(キャラ憑依|状況ズレ|マイム|サイコパス|キレ芸|ノリツッコミ|伏線回収オチ|すれ違いコント)/.test(allTechs)) {
    return "conte";
  }

  return "manzai";
}

function resolveScopedUserId(rawUserId, mode) {
  const id = String(rawUserId || "").trim();
  if (!id) return "";
  if (mode === "conte") {
    return id.startsWith("conte_") ? id : `conte_${id}`;
  }
  return id;
}

/* =========================
 * Supabase / Credit 管理
 * ========================= */

const FREE_QUOTA_DEFAULT = 500;
const FREE_QUOTA_IOS_NEW = 3;
const FREE_QUOTA_ANDROID_AD = 10;
const UNLIMITED_FLAG_VALUE = 999999;

function resolveQuotaByPlan(plan_type = "", mode = "manzai", verifiedIOS = false) {
  // App Attest 検証済みの iPhone 漫才メーカーは無料3回。
  if (mode === "manzai" && verifiedIOS) return FREE_QUOTA_IOS_NEW;
  // 暫定互換性: 検証なしの漫才は従来の500回枠。
  // これはAndroidの真正性を証明しないため、本番用の安全な分離ではない。
  if (mode === "manzai") return FREE_QUOTA_DEFAULT;
  if (plan_type === "conte_ios_unlimited") return FREE_QUOTA_IOS_NEW;
  if (plan_type === "conte_android_free_10") return FREE_QUOTA_ANDROID_AD;
  return FREE_QUOTA_DEFAULT;
}

async function getUsageRow(scoped_user_id) {
  if (!hasSupabase || !scoped_user_id) {
    throw Object.assign(new Error("Usage service unavailable or user_id missing"), { status: 503 });
  }

  try {
    const { data, error } = await supabase
      .from("user_usage")
      .select("output_count, paid_credits")
      .eq("user_id", scoped_user_id)
      .maybeSingle();

    if (error) throw error;
    return data || { output_count: 0, paid_credits: 0 };
  } catch (e) {
    console.error("[supabase] getUsageRow failed:", e?.message || e);
    throw Object.assign(new Error("Usage lookup unavailable"), { status: 503 });
  }
}

async function setUsageRow(scoped_user_id, { output_count, paid_credits }) {
  if (!hasSupabase || !scoped_user_id) {
    throw Object.assign(new Error("Usage service unavailable or user_id missing"), { status: 503 });
  }

  try {
    const { error } = await supabase
      .from("user_usage")
      .upsert({
        user_id: scoped_user_id,
        output_count,
        paid_credits,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (e) {
    console.error("[supabase] setUsageRow failed:", e?.message || e);
    throw Object.assign(new Error("Usage update unavailable"), { status: 503 });
  }
}

async function checkCredit(scoped_user_id, plan_type = "", mode = "manzai", verifiedIOS = false) {
  if (!hasSupabase || !scoped_user_id) {
    throw Object.assign(new Error("Usage service unavailable or user_id missing"), { status: 503 });
  }

  const row = await getUsageRow(scoped_user_id);
  const used = row.output_count ?? 0;
  const paid = row.paid_credits ?? 0;
  const quota = resolveQuotaByPlan(plan_type, mode, verifiedIOS);

  return {
    ok: used < quota || paid > 0,
    row
  };
}

async function consumeAfterSuccess(scoped_user_id, plan_type = "", mode = "manzai", verifiedIOS = false) {
  if (!hasSupabase || !scoped_user_id) {
    throw Object.assign(new Error("Usage service unavailable or user_id missing"), { status: 503 });
  }

  const quota = resolveQuotaByPlan(plan_type, mode, verifiedIOS);
  try {
    const { data, error } = await supabase.rpc("consume_generation_credit", {
      p_user_id: scoped_user_id,
      p_free_quota: quota
    });
    if (error) throw error;
    if (!data || data.ok !== true) {
      throw Object.assign(new Error("INSUFFICIENT_CREDITS"), {
        status: 402,
        code: "INSUFFICIENT_CREDITS"
      });
    }
    return {
      consumed: data.consumed,
      output_count: data.output_count,
      paid_credits: data.paid_credits
    };
  } catch (e) {
    console.error("[supabase] consumeAfterSuccess failed:", e?.message || e);
    if (e?.status === 402) throw e;
    throw Object.assign(new Error("Usage consumption unavailable"), { status: 503 });
  }
}

/* =========================
 * 漫才用の技法定義
 * ========================= */

const MANZAI_BOKE_DEFS = {
  IIMACHIGAI: "言い間違い／聞き間違い：音韻のズレで意外性を生むボケ。",
  HIYU: "比喩ボケ：比喩で誇張してのボケ。",
  GYAKUSETSU: "逆説ボケ：一見正論に聞こえるが論理が破綻しているボケ。",
  GIJI_RONRI: "擬似論理ボケ：論理風だが中身がズレているボケ。",
  TSUKKOMI_BOKE: "ツッコミボケ：ツッコミの発言が次のボケの伏線になるボケ。",
  RENSA: "ボケの連鎖：ボケが次のボケを誘発するように連続させ、加速感を生むボケ。",
  KOTOBA_ASOBI: "言葉遊び：ダジャレ・韻などで言語的にふざける。"
};

const MANZAI_TSUKKOMI_DEFS = {
  ODOROKI_GIMON: "驚き・疑問ツッコミ：観客の代弁として即時の驚き・疑問でのツッコミ。",
  AKIRE_REISEI: "呆れ・冷静ツッコミ：感情を抑えた冷静な態度でのツッコミ。",
  OKORI: "怒りツッコミ：怒ったような言い方でのツッコミ。",
  KYOKAN: "共感ツッコミ：相手の感情に一度共感してから、ツッコミをする。",
  META: "メタツッコミ：漫才の形式・構造そのものを指摘するツッコミ。"
};

const MANZAI_GENERAL_DEFS = {
  SANDAN_OCHI: "三段オチ：1・2をフリ、3で意外なオチ。",
  GYAKUHARI: "逆張り構成：期待・常識を外して予想を逆手に取る。",
  TENKAI_HAKAI: "展開破壊：築いた流れを意図的に壊し異質な要素を挿入。",
  KANCHIGAI_TEISEI: "勘違い→訂正：ボケの勘違いをツッコミが訂正する構成。",
  SURECHIGAI: "すれ違い：互いの前提が噛み合わずズレ続けて笑いを生む。",
  TACHIBA_GYAKUTEN: "立場逆転：途中または終盤で役割・地位がひっくり返る。"
};

/* =========================
 * コント専用の技法定義
 * ========================= */

const CONTE_BOKE_DEFS = {
  CHARA_HYOI: "キャラ憑依ボケ：強烈で独特なキャラクターになりきり、言動すべてで笑わせる。",
  JOKYO_ZURE: "状況ズレボケ：その場のシチュエーションや空気と全く噛み合わない言動をとる。",
  KODOGU_MIME: "小道具・マイムボケ：小道具や奇妙な動き・行動で視覚的・状況的にボケる。",
  SENMON_RULE: "専門用語・独自ルール：謎の専門用語や自分だけのルールを当然のように押し通す。",
  PSYCHOPATH: "狂気・サイコパス風：笑顔や冷静なトーンのまま、常識外れで少し怖いことをサラッと言う。",
  TENDON: "天丼（繰り返しボケ）：同じボケやフレーズをタイミングを変えて繰り返し、笑いを増幅させる。",
  BOYOMI: "棒読み・カタコト：感情がこもっていない不自然な話し方や挙動不審さで笑わせる。"
};

const CONTE_TSUKKOMI_DEFS = {
  KONWAKU: "困惑・戸惑いツッコミ：異常なボケに対して、一般人の視点からリアルに困惑して戸惑う。",
  AKIRE_REISEI: "呆れ・冷静ツッコミ：感情を抑えた冷静なトーンで淡々と異常さを指摘する。",
  KIREGEI: "キレ芸・絶叫ツッコミ：我慢の限界を超えて感情を爆発させ、勢いよくツッコむ。",
  KOGOE_KOKORO: "小声・心の声ツッコミ：本人に聞こえないような小声や独り言で状況をツッコむ。",
  NORI_TSUKKOMI: "ノリツッコミ：相手のボケの世界観に一度乗っかって演じてから、我に返ってツッコむ。"
};

const CONTE_GENERAL_DEFS = {
  TACHIBA_GYAKUTEN: "立場逆転：最初は優位だった側（店員と客、上司と部下など）の立場が後半で完全に逆転する。",
  KINCHO_KANWA: "緊張と緩和：シリアスで緊迫した空気を作ってから、くだらない一言で一気に脱力させる。",
  FUKUSEN_KAISHU: "伏線回収オチ：序盤にさりげなく出した言葉や設定が、最後のオチで鮮やかに回収される。",
  ESCALATE: "エスカレート構成：最初は小さな違和感だったボケが、徐々に巨大・異常にエスカレートしていく。",
  SURECHIGAI: "すれ違いコント：お互いが別のことを思い込んだまま会話が成立してしまい、ズレが膨らむ。",
  TENKAI_HAKAI: "展開破壊（シュール）：これまでの設定や流れをぶち壊す不条理な展開に突入する。"
};

const ALIAS_MAP = {
  "言い間違い／聞き間違い": "IIMACHIGAI",
  "比喩ボケ": "HIYU",
  "逆説ボケ": "GYAKUSETSU",
  "擬似論理ボケ": "GIJI_RONRI",
  "ツッコミボケ": "TSUKKOMI_BOKE",
  "ボケの連鎖": "RENSA",
  "言葉遊び": "KOTOBA_ASOBI",
  "驚き・疑問ツッコミ": "ODOROKI_GIMON",
  "呆れ・冷静ツッコミ": "AKIRE_REISEI",
  "怒りツッコミ": "OKORI",
  "共感ツッコミ": "KYOKAN",
  "メタツッコミ": "META",
  "三段オチ": "SANDAN_OCHI",
  "逆張り構成": "GYAKUHARI",
  "展開破壊": "TENKAI_HAKAI",
  "勘違い→訂正": "KANCHIGAI_TEISEI",
  "すれ違い": "SURECHIGAI",
  "立場逆転": "TACHIBA_GYAKUTEN",
  "sandanOchi": "SANDAN_OCHI",
  "gyakuhari": "GYAKUHARI",
  "tenkaiHakai": "TENKAI_HAKAI",
  "kanchigaiTeisei": "KANCHIGAI_TEISEI",
  "surechigai": "SURECHIGAI",
  "tachibaGyakuten": "TACHIBA_GYAKUTEN",

  "キャラ憑依ボケ": "CHARA_HYOI",
  "状況ズレボケ": "JOKYO_ZURE",
  "小道具・マイムボケ": "KODOGU_MIME",
  "専門用語・独自ルール": "SENMON_RULE",
  "狂気・サイコパス風": "PSYCHOPATH",
  "天丼（繰り返しボケ）": "TENDON",
  "棒読み・カタコト": "BOYOMI",
  "困惑・戸惑いツッコミ": "KONWAKU",
  "キレ芸・絶叫ツッコミ": "KIREGEI",
  "小声・心の声ツッコミ": "KOGOE_KOKORO",
  "ノリツッコミ": "NORI_TSUKKOMI",
  "緊張と緩和": "KINCHO_KANWA",
  "伏線回収オチ": "FUKUSEN_KAISHU",
  "エスカレート構成": "ESCALATE",
  "すれ違いコント": "SURECHIGAI",
  "展開破壊（シュール）": "TENKAI_HAKAI"
};

function resolveTechKey(item, table) {
  const s = String(item || "").trim();
  if (!s) return null;
  if (table[s]) return s;
  if (ALIAS_MAP[s] && table[ALIAS_MAP[s]]) return ALIAS_MAP[s];
  for (const [k, def] of Object.entries(table)) {
    const label = def.split("：")[0].trim();
    if (label === s || def.startsWith(s)) {
      return k;
    }
  }
  return null;
}

/* =========================
 * 文字数・整形ユーティリティ
 * ========================= */

function extractStageMetaAndClean(rawText) {
  let stageStyle = "";
  let leftCostume = "";
  let rightCostume = "";

  const lines = String(rawText || "").replace(/\r\n/g, "\n").split("\n");
  const remaining = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const mStage = trimmed.match(/^(?:\[)?STAGE\s*[:：]\s*([A-Z_]+)(?:\])?$/i);
    if (mStage) {
      stageStyle = mStage[1].toUpperCase();
      continue;
    }
    const mLeft = trimmed.match(/^(?:\[)?LEFT_COSTUME\s*[:：]\s*([A-Z_]+)(?:\])?$/i);
    if (mLeft) {
      leftCostume = mLeft[1].toUpperCase();
      continue;
    }
    const mRight = trimmed.match(/^(?:\[)?RIGHT_COSTUME\s*[:：]\s*([A-Z_]+)(?:\])?$/i);
    if (mRight) {
      rightCostume = mRight[1].toUpperCase();
      continue;
    }
    remaining.push(line);
  }

  return {
    cleanedRaw: remaining.join("\n").trim(),
    stageStyle,
    leftCostume,
    rightCostume
  };
}

function enforceCharLimit(text, minLen, maxLen, allowOverflow = true) {
  if (!text) return "";

  let t = text
    .trim()
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s.*$/gm, "")
    .trim();

  if (!allowOverflow && t.length > maxLen) {
    const softCut = t.lastIndexOf("\n", maxLen);
    const softPuncs = ["。", "！", "？", "…", "♪"];
    const softPuncCut = Math.max(...softPuncs.map((p) => t.lastIndexOf(p, maxLen)));

    let cutPos = Math.max(softPuncCut, softCut);
    if (cutPos < maxLen * 0.9) {
      cutPos = maxLen;
    }

    t = t.slice(0, cutPos).trim();
    if (!/[。！？…♪]$/.test(t)) {
      t += "。";
    }
  }

  if (t.length < minLen && !/[。！？…♪]$/.test(t)) {
    t += "。";
  }

  return t;
}

function detectTsukkomiSpeakerFromScript(text, fallbackName = "B") {
  if (!text) return fallbackName;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const speakers = [];
  for (const line of lines) {
    const m = line.match(/^([^:\n：]{1,15})[：:]\s*/);
    if (m) {
      const who = m[1].trim();
      if (who.includes("ツッコミ") || who.includes("右") || who === "B") {
        return who;
      }
      if (!speakers.includes(who)) {
        speakers.push(who);
      }
    }
  }
  return speakers.length >= 2 ? speakers[1] : fallbackName;
}

function ensureManzaiTsukkomiOutro(text, defaultTsukkomiName = "B") {
  const actualTsukkomi = detectTsukkomiSpeakerFromScript(text, defaultTsukkomiName);
  const outro = `${actualTsukkomi}: [叩く] もういいよ！`;
  if (!text) return outro;

  let t = text.trim();
  const alreadyHasNaturalEnding = /(?:もういいよ|もうええわ|いい加減にしろ|ありがとうございました)[！!ー〜]*\s*$/.test(t);
  if (alreadyHasNaturalEnding) {
    return t;
  }

  return t ? `${t}\n\n${outro}` : outro;
}

// 役名のゆれを照合し、判定できた台詞をユーザーが指定した正式な左/右の配役名へ統一する。
// これにより iOS の口パク・声色・動物Spriteの左右が同じ話者名を使える。
// 本文（台詞そのもの）は変えない。曖昧な台詞を別の役に強制的に付け替えない。
function canonicalizeConteSpeakerLabels(text, leftRole, rightRole) {
  if (!leftRole || !rightRole || leftRole === "A" && rightRole === "B") return text;
  const normalize = (s) => String(s || "")
    .replace(/^(?:左(?:側|役)?|右(?:側|役)?|ボケ役?|ツッコミ役?)\s*[:：]\s*/, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s　「」『』]/g, "")
    .replace(/スマートフォン/g, "スマホ")
    .replace(/ネコ/g, "猫").replace(/イヌ/g, "犬").replace(/うさぎ/g, "ウサギ");
  const cast = [normalize(leftRole), normalize(rightRole)];
  const normalizeSideHint = (original) => {
    const s = String(original || "").trim();
    if (/^(?:左(?:側|役)?|ボケ|A|①|1)(?:[（(].*?[）)])?$/.test(s)) return 0;
    if (/^(?:右(?:側|役)?|ツッコミ|B|②|2)(?:[（(].*?[）)])?$/.test(s)) return 1;
    return null;
  };
  const matchScore = (speaker, role) => {
    if (!speaker || !role) return 0;
    if (speaker === role) return 120;
    const leftKind = inferRoleCostume(speaker);
    const rightKind = inferRoleCostume(role);
    if (leftKind.kind === "nonhuman") {
      if (rightKind.kind === "human") return 0;
      if (rightKind.kind === "nonhuman" && leftKind.costume !== rightKind.costume) return 0;
    }
    if (speaker.length >= 2 && role.endsWith(speaker)) return 105;
    if (speaker.length >= 2 && role.startsWith(speaker)) return 90;
    if (speaker.length >= 2 && role.includes(speaker)) return 65;
    if (role.length >= 3 && speaker.includes(role)) return 60;
    const aliases = { "犬":"柴犬", "ネコ":"猫", "お客さん":"客", "お客":"客", "店長":"店員", "飼育担当":"飼育員" };
    if (aliases[speaker] && role.includes(aliases[speaker])) return 58;
    return 0;
  };
  const lines = String(text).split("\n");
  const labels = [];
  for (const line of lines) {
    const m = line.match(/^(\s*)([^\n:：]{1,50})[:：](\s*[\s\S]*)$/);
    if (m && !/^\d+$/.test(m[2].trim())) {
      const name = m[2].trim();
      if (!labels.includes(name)) labels.push(name);
    }
  }
  const assigned = new Map();
  for (const label of labels) {
    const hint = normalizeSideHint(label);
    if (hint !== null) { assigned.set(label, hint); continue; }
    const name = normalize(label);
    const scores = cast.map((role) => matchScore(name, role));
    if (scores[0] > scores[1] && scores[0] >= 58) assigned.set(label, 0);
    else if (scores[1] > scores[0] && scores[1] >= 58) assigned.set(label, 1);
  }
  // 片側が確定し他に未知名が一つの場合に限り、残る役へ対応させる。
  const unknown = labels.filter((label) => !assigned.has(label));
  const used = new Set(assigned.values());
  if (unknown.length === 1 && used.size === 1) {
    const vacant = used.has(0) ? 1 : 0;
    const spokenKind = inferRoleCostume(normalize(unknown[0]));
    const vacantKind = inferRoleCostume(cast[vacant]);
    // 「猫カフェの店員」をAIが「猫」と誤表記した際など、動物の種類が
    // 一致しない台詞を反対側へ強制割り当てしない。
    if (spokenKind.kind !== "nonhuman" ||
        (vacantKind.kind === "nonhuman" && spokenKind.costume === vacantKind.costume)) {
      assigned.set(unknown[0], vacant);
    }
  }

  return lines.map((line) => {
    const m = line.match(/^(\s*)([^\n:：]{1,50})[:：](\s*[\s\S]*)$/);
    if (!m || !assigned.has(m[2].trim())) return line;
    const roleName = assigned.get(m[2].trim()) === 0 ? leftRole : rightRole;
    return `${m[1]}${roleName}: ${m[3].trimStart()}`;
  }).join("\n");
}

function normalizeSpeakerColons(s) {
  return s.replace(/(^|\n)([^\n:：]+)[：:]\s*/g, (_m, head, name) => `${head}${name}: `);
}

function ensureBlankLineBetweenTurns(text) {
  const lines = text.split("\n");
  const compressed = [];

  for (const ln of lines) {
    if (
      ln.trim() === "" &&
      compressed.length &&
      compressed[compressed.length - 1].trim() === ""
    ) {
      continue;
    }
    compressed.push(ln);
  }

  const out = [];
  for (let i = 0; i < compressed.length; i++) {
    const cur = compressed[i];
    out.push(cur);

    const isTurn = /^[^:\n：]+:\s/.test(cur.trim());
    const next = compressed[i + 1];
    const nextIsTurn = next != null && /^[^:\n：]+:\s/.test(next?.trim() || "");

    if (isTurn && nextIsTurn) {
      if (cur.trim() !== "" && (next || "").trim() !== "") {
        out.push("");
      }
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function splitTitleAndBody(s) {
  if (!s) return { title: "", body: "" };

  const trimmed = String(s).trim();

  const firstLine = trimmed.split(/\r?\n/)[0].trim();
  if (/^[^:\n：]{1,12}[：:]\s*\S/.test(firstLine) && !/^(タイトル|Title)/i.test(firstLine)) {
    return { title: "", body: trimmed };
  }

  const match = trimmed.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline === -1) {
      return { title: "", body: trimmed };
    }
    const rawTitle = trimmed.slice(0, firstNewline).trim();
    const body = trimmed.slice(firstNewline + 1).trim();
    return {
      title: rawTitle.replace(/^【/, "").replace(/】$/, ""),
      body
    };
  }

  const rawTitle = trimmed.slice(0, match.index).trim();
  const title = rawTitle.replace(/^【/, "").replace(/】$/, "");
  const body = trimmed.slice(match.index + match[0].length).trim();

  return { title, body };
}

function normalizeTitleString(str = "") {
  return String(str)
    .trim()
    .replace(/^【/, "")
    .replace(/】$/, "")
    .replace(/^(タイトル|Title)\s*[:：】]?\s*/i, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\s+/g, " ");
}

function ensureSingleTitle(titleIn, bodyIn) {
  let title = normalizeTitleString(titleIn || "");
  let body = (bodyIn || "").replace(/\r\n/g, "\n");
  let lines = body.split("\n");

  while (lines.length && lines[0].trim() === "") {
    lines.shift();
  }

  if (!title && lines.length) {
    const first = lines[0].trim();
    if (
      first.startsWith("#") ||
      /^【.+】$/.test(first) ||
      /^(タイトル|Title)\s*[:：]/i.test(first)
    ) {
      title = normalizeTitleString(first);
      lines.shift();
      while (lines.length && lines[0].trim() === "") {
lines.shift();
      }
    }
  }

  if (title && lines.length) {
    const normTitle = normalizeTitleString(title);
    const first = lines[0].trim();
    const firstNorm = normalizeTitleString(first);

    if (
      first.startsWith("#") ||
      /^【.+】$/.test(first) ||
      /^(タイトル|Title)\s*[:：]/i.test(first) ||
      firstNorm.toLowerCase() === normTitle.toLowerCase()
    ) {
      lines.shift();
      while (lines.length && lines[0].trim() === "") {
        lines.shift();
      }
      title = normTitle;
    }
  }

  return {
    title: title || "無題",
    body: lines.join("\n")
  };
}

/* =========================
 * ガイドライン・プロンプト作成（漫才・コント両対応）
 * ========================= */

function parseCharacterNames(charDesc) {
  // 左右の配役はリクエストの順序で固定し、AIが名前や衣装を入れ替えても上書きしない。
  const source = String(charDesc || "").trim().replace(/\r\n?/g, "\n");
  const cleanName = (raw) => String(raw || "")
    .replace(/^\s*(?:配役|登場人物|キャラクター)\s*[:：]\s*/, "")
    .replace(/^\s*(?:左(?:側|役)?|右(?:側|役)?|ボケ役?|ツッコミ役?)\s*[:：]\s*/, "")
    .trim();
  const labeled = source.match(/^(?:(?:配役|登場人物|キャラクター)\s*[:：]\s*)?左(?:側|役)?\s*[:：]\s*(.+?)\s*(?:[,、，／/;；\n]|\s+・\s+|・)\s*右(?:側|役)?\s*[:：]\s*(.+?)\s*$/s);
  if (labeled) return { bokeName: cleanName(labeled[1]) || "A", tsukkomiName: cleanName(labeled[2]) || "B" };

  // 中点「・」は役名の一部にも使うため、原則として区切りに使わない。
  let parts = source.split(/[,、，／/;；\n]+/).map(cleanName).filter(Boolean);
  if (parts.length < 2) parts = source.split(/\s+・\s+/).map(cleanName).filter(Boolean);
  if (parts.length < 2) {
    const pair = source.match(/^(パンダ|猫|犬|柴犬|ゴリラ|クマ|ウサギ|ペンギン|タコ|冷蔵庫|スマホ|ロボット)[・と](パンダ|猫|犬|柴犬|ゴリラ|クマ|ウサギ|ペンギン|タコ|冷蔵庫|スマホ|ロボット)$/);
    if (pair) return { bokeName: pair[1], tsukkomiName: pair[2] };
  }
  if (parts.length >= 2) return { bokeName: parts[0], tsukkomiName: parts[1] };
  return { bokeName: "A", tsukkomiName: "B" };
}

// Do not trust AI's LEFT_COSTUME/RIGHT_COSTUME when a recognizable role is in
// the user's input. This prevents a panda/cat swap in the metadata itself.
const ROLE_ANIMAL_COSTUMES = [
  ["柴犬", "ANIMAL_DOG"], ["番犬", "ANIMAL_DOG"], ["犬", "ANIMAL_DOG"], ["狼", "ANIMAL_DOG"],
  ["猫", "ANIMAL_CAT"], ["ニャンコ", "ANIMAL_CAT"], ["ライオン", "ANIMAL_CAT"], ["虎", "ANIMAL_CAT"],
  ["パンダ", "ANIMAL_PANDA"], ["ゴリラ", "ANIMAL_GORILLA"], ["チンパンジー", "ANIMAL_GORILLA"],
  ["クマ", "ANIMAL_BEAR"], ["熊", "ANIMAL_BEAR"], ["ウサギ", "ANIMAL_RABBIT"], ["うさぎ", "ANIMAL_RABBIT"], ["兎", "ANIMAL_RABBIT"],
  ["ペンギン", "ANIMAL_BIRD_PENGUIN"], ["タコ", "ANIMAL_OCTOPUS"], ["イカ", "ANIMAL_OCTOPUS"],
  ["宇宙人", "ANIMAL_ALIEN"], ["エイリアン", "ANIMAL_ALIEN"],
  ["冷蔵庫", "OBJECT_FRIDGE"], ["スマートフォン", "OBJECT_SMARTPHONE"], ["スマホ", "OBJECT_SMARTPHONE"],
  ["りんご", "OBJECT_APPLE"], ["リンゴ", "OBJECT_APPLE"], ["おにぎり", "OBJECT_ONIGIRI"],
  ["信号機", "OBJECT_TRAFFIC_LIGHT"], ["聖剣", "OBJECT_SWORD"], ["魔剣", "OBJECT_SWORD"],
  ["トイレ", "OBJECT_TOILET"], ["便器", "OBJECT_TOILET"], ["ロボット", "OBJECT_ROBOT"]
];
const HUMAN_ROLE_WORDS = [
  "店員", "客", "飼育員", "飼育担当", "飼い主", "美容師", "医者", "看護師", "患者", "先生", "教師", "生徒",
  "刑事", "警官", "警察", "上司", "部下", "社長", "運転手", "司会", "人間", "スタッフ", "社員", "係員", "応募者", "面接官", "世話係"
];
function inferRoleCostume(role) {
  const name = String(role || "").trim().replace(/^(?:左(?:側|役)?|右(?:側|役)?|ボケ役?|ツッコミ役?)\s*[:：]\s*/, "");
  let candidate = "", animalPosition = -1;
  for (const [keyword, code] of ROLE_ANIMAL_COSTUMES) {
    const pos = name.lastIndexOf(keyword);
    if (pos < 0) continue;
    const after = name.slice(pos + keyword.length);
    if (/^(好き|派|カフェ|の飼い主|を飼う|のファン)/.test(after)) continue;
    if (pos >= animalPosition) { candidate = code; animalPosition = pos; }
  }
  const humanPosition = Math.max(-1, ...HUMAN_ROLE_WORDS.map((word) => name.lastIndexOf(word)));
  if (humanPosition > animalPosition) return { kind: "human", costume: "" };
  if (candidate) return { kind: "nonhuman", costume: candidate };
  if (humanPosition >= 0) return { kind: "human", costume: "" };
  return { kind: "unknown", costume: "" };
}

function reconcileRoleCostume(role, generatedCode) {
  const inferred = inferRoleCostume(role);
  const aiCode = String(generatedCode || "").trim().toUpperCase();
  if (inferred.kind === "nonhuman") return inferred.costume;
  if (inferred.kind === "human" && /^(ANIMAL_|OBJECT_)/.test(aiCode)) return "CASUAL_PLAIN";
  return aiCode;
}

function buildPromptByMode({
  mode = "manzai",
  theme = "",
  genre = "",
  characters = "",
  length = 1000,
  selected = {}
}) {
  const isConte = mode === "conte";

  const bokeTable = isConte ? { ...MANZAI_BOKE_DEFS, ...CONTE_BOKE_DEFS } : MANZAI_BOKE_DEFS;
  const tsukkomiTable = isConte ? { ...MANZAI_TSUKKOMI_DEFS, ...CONTE_TSUKKOMI_DEFS } : MANZAI_TSUKKOMI_DEFS;
  const generalTable = isConte ? { ...MANZAI_GENERAL_DEFS, ...CONTE_GENERAL_DEFS } : MANZAI_GENERAL_DEFS;

  const boke = Array.isArray(selected.boke) ? selected.boke : [];
  const tsukkomi = Array.isArray(selected.tsukkomi) ? selected.tsukkomi : [];
  const general = Array.isArray(selected.general) ? selected.general : [];

  const toLabel = (items, table) =>
    items
      .map((item) => {
        const key = resolveTechKey(item, table);
        if (key && table[key]) {
          return table[key].split("：")[0].trim();
        }
        return String(item || "").trim();
      })
      .filter(Boolean);

  const selectedLabels = {
    boke: toLabel(boke, bokeTable),
    tsukkomi: toLabel(tsukkomi, tsukkomiTable),
    general: toLabel(general, generalTable)
  };

  const bokeLines = boke.map((k) => {
    const key = resolveTechKey(k, bokeTable);
    return key ? `- ${bokeTable[key]}` : `- ${k}`;
  }).filter(Boolean);

  const tsukkomiLines = tsukkomi.map((k) => {
    const key = resolveTechKey(k, tsukkomiTable);
    return key ? `- ${tsukkomiTable[key]}` : `- ${k}`;
  }).filter(Boolean);

  const generalLines = general.map((k) => {
    const key = resolveTechKey(k, generalTable);
    return key ? `- ${generalTable[key]}` : `- ${k}`;
  }).filter(Boolean);

  const guidelineParts = [];
  if (bokeLines.length) guidelineParts.push("【ボケ技法】", ...bokeLines);
  if (tsukkomiLines.length) guidelineParts.push("【ツッコミ技法】", ...tsukkomiLines);
  if (generalLines.length) guidelineParts.push("【全般の構成技法】", ...generalLines);
  const guideline = guidelineParts.join("\n");

  const techniquesForMeta = [
    ...selectedLabels.boke,
    ...selectedLabels.tsukkomi,
    ...selectedLabels.general
  ];
  const structureMeta = [...selectedLabels.general];

  const cleanedTheme = String(theme || "")
    .replace(/（※漫才ではなく[\s\S]*?）/g, "")
    .trim();

  const safeTheme = cleanedTheme || (isConte ? "深夜のコンビニ" : "日常生活");
  const safeGenre = String(genre || "").trim() || (isConte ? "コント" : "漫才");
  const charDesc = typeof characters === "string"
    ? characters.trim()
    : JSON.stringify(characters ?? "");

  const { bokeName, tsukkomiName } = parseCharacterNames(charDesc);

  const targetLen = Number.isFinite(Number(length)) && Number(length) > 0
    ? Math.floor(Number(length))
    : 1000;

  const minLen = Math.max(100, Math.floor(targetLen * 0.9));
  const maxLen = Math.max(minLen, Math.ceil(targetLen * 1.1));

  const techniqueText = techniquesForMeta.length
    ? techniquesForMeta.join("、")
    : "指定なし";

  // ★ コント専用プロンプト
  if (isConte) {
    const systemPrompt = [
      "あなたはキングオブコントの優勝ネタを数多く手掛ける天才コント作家です。",
      "舞台でそのまま演じられる、最高に面白おかしくて笑える日本語のコント（寸劇）台本を作成してください。",
      "説明やト書きではなく、指定された舞台メタ情報とタイトル、完成したセリフの掛け合いだけを出力してください。",
      "登場人物に『動物』や『物』が指定されている場合は、その動物の習性や無機物ならではの機能・視点をフル活用したシュールで爆笑できるボケとツッコミを展開してください。",
      "2人は基本的には定位置で立ち止まって会話し、詰め寄る・逃げる・隠れる・作業するなど『動きに明確な意味がある場面』でのみ移動タグを使ってください。"
    ].join("\n");

    const costumeCodesList = [
      "【人間の衣装（人間役の場合は必ずここから選ぶこと）】CLERK_APRON (店員・バイト) / SHOPPER_BAG (買い物客) / POLICE_DETECTIVE (刑事・警察) / SUSPECT_GLASSES (容疑者) / DOCTOR_COAT (医者・執刀医) / PATIENT_BANDAGE (患者) / TEACHER_POINTER (先生・教師) / STUDENT_CAP (生徒・学生) / WAITER_TRAY (ウェイター) / CAFE_GUEST_MENU (レストランの客) / BOSS_RED_TIE (面接官・社長・上司・窓口係) / APPLICANT_BLUE_TIE (応募者・会社員・部下) / ROBBER_MASK (強盗・犯人) / HERO_SWORD (勇者・騎士) / DEMON_MAGE_STAFF (魔王・魔法使い) / DRIVER_CAP (運転手) / CHEF_HAT (シェフ・大将) / BARBER_SCISSORS (美容師) / ATHLETE_HEADBAND (トレーナー・格闘家) / MC_MIC (司会・販売員) / STATION_STAFF (駅員・警備員) / CASUAL_PLAIN (一般人・私服・該当なし)",
      "【動物の姿（役名が動物の場合のみ選択）】ANIMAL_DOG (犬・柴犬・狼) / ANIMAL_CAT (猫・虎・ライオン) / ANIMAL_PANDA (パンダ) / ANIMAL_GORILLA (ゴリラ・猿・チンパンジー) / ANIMAL_BEAR (クマ・ヒグマ) / ANIMAL_RABBIT (ウサギ) / ANIMAL_BIRD_PENGUIN (ペンギン・鳥) / ANIMAL_OCTOPUS (タコ・イカ) / ANIMAL_ALIEN (宇宙人)",
      "【物の姿（役名が物の場合のみ選択）】OBJECT_FRIDGE (冷蔵庫・家電) / OBJECT_SMARTPHONE (スマホ・PC) / OBJECT_APPLE (りんご・果物) / OBJECT_ONIGIRI (おにぎり・寿司・食パン) / OBJECT_TRAFFIC_LIGHT (信号機) / OBJECT_SWORD (聖剣・メス・文房具) / OBJECT_TOILET (トイレ・便器) / OBJECT_ROBOT (AIロボット・メカ)"
    ].join("\n");
const prompt = [
      "以下の条件で、日本語のコント（寸劇）台本を1本作成してください。",
      "",
      `【シチュエーション・舞台設定】${safeTheme}`,
      `【ジャンル・作風】${safeGenre}`,
      `【登場人物・配役】${charDesc || `${bokeName}（ボケ役）、${tsukkomiName}（ツッコミ役）`}`,
      `※左側のボケ役を「${bokeName}」、右側のツッコミ役を「${tsukkomiName}」として台詞を書いてください。`,
      `※配役を絶対に入れ替えないこと。左（${bokeName}）と右（${tsukkomiName}）はセリフ・衣装・動物の種類が常に一致すること。パンダと猫は特に混同しない。`,
      `※話者名には「${bokeName}」「${tsukkomiName}」を毎回そのまま使い、別名・A/B・役の略称へ置き換えないこと。`,
      `【目標文字数】${targetLen}文字（${minLen}〜${maxLen}文字程度）`,
      "",
      "【採用するコント技法】",
      techniqueText,
      "",
      guideline ? "【技法ガイドライン】\n" + guideline : "",
      "",
      "【舞台セットと演者の姿・衣装の指定（最優先・必須）】",
      "アプリのステージ背景と2人の姿（人間・動物・物）を完全一致させるため、出力の一番最初（タイトルの前）に以下の3行を必ず出力してください。",
      "※重要：人間の役柄なのに ANIMAL_ や OBJECT_ を選ぶことは絶対に禁止です。またパンダは ANIMAL_PANDA、ゴリラは ANIMAL_GORILLA、クマは ANIMAL_BEAR を正確に選んでください。",
      "STAGE: (SHOP_COUNTER / INTERROGATION / HOSPITAL / CLASSROOM / CAFE_TABLE / OFFICE_DESK / BANK_ROBBERY / FANTASY_HERO / TAXI_CAR / HAIR_SALON / GYM_RING / TV_STUDIO / TRAIN_STATION / HOME_LIVING / NONE から1つ。合わない場合は NONE)",
      `LEFT_COSTUME: (${bokeName}の衣装または動物・物の姿を下記コードから1つ選択)`,
      `RIGHT_COSTUME: (${tsukkomiName}の衣装または動物・物の姿を下記コードから1つ選択)`,
      costumeCodesList,
      "",
      "【アプリ上演用の演出タグルール（重要）】",
      "基本的には2人が立ち止まって会話し、意味のある場面でのみ移動や特殊リアクションを行うよう、各セリフのコロン（:）の直後に以下のタグを1つ付けてください。",
      "- [通常] ：立ち止まって通常の会話をする",
      "- [ボケ] ：立ち止まっておどけたボケ、ズレた発言をする",
      "- [演技] ：役柄になりきった芝居・マイムをする",
      "- [疑問] ：首をかしげる疑問や問いかけ",
      "- [呆れ] ：呆れたツッコミ、ため息混じりに冷静に指摘する",
      "- [ツッコミ] ：勢いよくツッコむ・指摘する",
      "- [驚愕] ：相手の衝撃的な発言や事態にすごく驚いて「目玉がビョーンと飛び出る」大リアクション（※台本中で本当に驚く決定的な場面で1〜2回使用！）",
      "- [叩く] ：コント後半のクライマックスに入れる「渾身の強ツッコミ」（※台本全体で1〜2回に厳選）",
      "- [ズッコケ] ：相手のボケに拍子抜けして床にひっくり返る",
      "- [キメ] ：ドヤ顔でカッコつける・キメポーズをとる",
      "- [土下座] ：床に頭を擦り付けて必死に謝罪・懇願する",
      "- [作業] ：（意味のある移動）カウンターや机・設備に歩み寄って作業する",
      "- [詰め寄る] ：（意味のある移動）相手の目の前までグッと歩いて迫る・圧をかける",
      "- [逃げる] ：（意味のある移動）怖がったり驚いたりして舞台の端へ後ずさりして離れる",
      "- [隠れる] ：（意味のある移動）舞台の奥へ身を潜める",
      "",
      "【コントの出力フォーマット（厳守）】",
      "1〜3行目：STAGE / LEFT_COSTUME / RIGHT_COSTUME の指定",
      "4行目：タイトル文字列のみ（【】や「タイトル:」は付けない）",
      "5行目：空行",
      `6行目以降：「${bokeName}: [タグ] セリフ」「${tsukkomiName}: [タグ] セリフ」の掛け合い（各セリフの間に空行を1つ入れる）`,
      "- 漫才ではないため、冒頭の「どうもー！」や最後の「もういいよ！」「ありがとうございました」は絶対に入れないでください。",
      "- 最後はコントらしい鮮やかで面白いオチのセリフ（暗転のキッカケになる一言）でピタッと終える。"
    ].join("\n");

    return {
      systemPrompt,
      prompt,
      techniquesForMeta,
      structureMeta,
      maxLen,
      minLen,
      bokeName,
      tsukkomiName,
      targetLen,
      safeTheme,
      safeGenre,
      charDesc
    };
  }

  // ★ 漫才専用プロンプト
  const systemPrompt = [
    "あなたはM-1グランプリの決勝ネタを数多く手掛けるプロの漫才作家です。",
    "舞台でそのまま使える、日本語の漫才台本を作成してください。",
    "説明や分析ではなく、完成した台本だけを出力してください。",
    "必ず自然な掛け合いと、伏線を回収する明確で面白いオチを作ってください。",
    "アプリのステージ演出と連携するため、指定された演出タグ（[通常] [ボケ] [演技] [疑問] [呆れ] [ツッコミ] [叩く]）を各セリフの先頭に必ず付けてください。"
  ].join("\n");

  const prompt = [
    "以下の条件で、日本語の漫才台本を1本作成してください。",
    "",
    `【題材】${safeTheme}`,
    `【ジャンル】${safeGenre}`,
    `【登場人物】${charDesc || `${bokeName}（ボケ）、${tsukkomiName}（ツッコミ）`}`,
    `※左側のボケ役を「${bokeName}」、右側のツッコミ役を「${tsukkomiName}」として台詞を書いてください。`,
    `【目標文字数】${targetLen}文字（${minLen}〜${maxLen}文字程度）`,
    "",
    "【採用する技法】",
    techniqueText,
    "",
    guideline ? "【技法ガイドライン】\n" + guideline : "",
    "",
    "【アプリ上演用の演出タグルール（重要）】",
    "アプリ内でキャラクターが動き・声色・効果音をつけるため、各セリフのコロン（:）の直後に、文脈に合った以下の演出タグを1つ付けてください。",
    "- [通常] ：普通の会話やフリのセリフ",
    "- [ボケ] ：おどけたボケ、アホな発言、ズレた発言",
    "- [演技] ：コント風のなりきり、モノマネ、カギカッコ付きのセリフ",
    "- [疑問] ：首をかしげる疑問や問いかけ",
    "- [呆れ] ：呆れたツッコミ、ため息混じりの冷静な指摘",
    "- [ツッコミ] ：通常の勢いあるツッコミ・指摘",
    "- [叩く] ：ネタ後半のクライマックスや決定的な瞬間、または最後の締めに入れる「ここぞという渾身の強ツッコミ」（※台本全体で1〜2回だけに厳選すること！）",
    "",
    "【出力ルール】",
    "- タイトルを最初に1つだけ出す（【】や「タイトル:」は付けずタイトル文字列のみ）。",
    "- タイトルと本文の間には空行を1つ入れる。",
    `- 本文は必ず「${bokeName}: [タグ] セリフ」「${tsukkomiName}: [タグ] セリフ」の形式にする。`,
    "- 各台詞の間には空行を1つ入れる。",
    "- 解説、分析、制作意図、技法名の説明は一切出力しない。",
    "- 技法名そのものを台詞にしない。",
    `- 最後は必ず ${tsukkomiName}: [叩く] もういいよ！（または「もうええわ！」）で綺麗にオチをつけて締める。`,
    "- 固有名詞や具体的な数字を使い、抽象的な表現を避ける。",
    "- 舞台でそのまま使えるテンポの良い自然な掛け合いにする。"
  ].join("\n");

  return {
    systemPrompt,
    prompt,
    techniquesForMeta,
    structureMeta,
    maxLen,
    minLen,
    tsukkomiName,
    targetLen,
    safeTheme,
    safeGenre,
    charDesc
  };
}

/* =========================
 * OpenAI クライアント
 * ========================= */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

function extractTextFromResponse(response) {
  if (!response) return "";

  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  if (Array.isArray(response.output)) {
    const chunks = [];
    for (const item of response.output) {
      if (typeof item?.text === "string") {
        chunks.push(item.text);
      }
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string") {
            chunks.push(c.text);
          } else if (typeof c?.output_text === "string") {
            chunks.push(c.output_text);
          }
        }
      }
    }
    const joined = chunks.join("\n").trim();
    if (joined.length > 0) return joined;
  }

  if (typeof response?.choices?.[0]?.message?.content === "string") {
    return response.choices[0].message.content;
  }

  return "";
}

const client = {
  chat: {
    completions: {
      async create(payload) {
        if (!openai) {
          const err = new Error("OPENAI_API_KEY is not set");
          err.status = 500;
          throw err;
        }

        const model = payload.model || OPENAI_MODEL;
        const messages = Array.isArray(payload.messages) ? payload.messages : [];

        const input = messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
          content: String(m.content ?? "")
        }));

        const request = {
          model,
          input,
          max_output_tokens: 16384
        };

        const response = await openai.responses.create(request);
        const text = extractTextFromResponse(response);

        if (!text) {
console.warn(
            "[openai] response text was empty. status:",
            response?.status,
            "incomplete_details:",
            response?.incomplete_details
          );
        }

        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: text
              }
            }
          ]
        };
      }
    }
  }
};

function normalizeError(err) {
  return {
    name: err?.name,
    message: err?.message,
    status: err?.status ?? err?.response?.status,
    data: err?.response?.data ?? err?.error,
    stack: process.env.NODE_ENV === "production" ? undefined : err?.stack
  };
}

/* =========================
 * メイン handler
 * ========================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = req.body || {};
    const action = body.action || "generate";

    const mode = detectAppMode(body);
    const rawUserId = String(body.user_id || "").trim();
    const scopedUserId = resolveScopedUserId(rawUserId, mode);

    // 1. 購入クレジット追加 / 買い切りアンロック
    if (action === "add_credits" || action === "add_credit") {
      // 購入情報は /api/iap/verify で Apple の署名検証後にのみ付与する。
      return res.status(403).json({ error: "Purchase verification required" });
    }

    // 2. クレジット残高照会
    if (action === "get_credit" || action === "get_credits") {
      const row = await getUsageRow(scopedUserId);
      return res.status(200).json({
        ok: true,
        mode,
        user_id: rawUserId,
        output_count: row.output_count ?? 0,
        usage_count: row.output_count ?? 0,
        paid_credits: row.paid_credits ?? 0
      });
    }

    // ★ 3. AIによる「おまかせ設定」（漫才モードとコントモードの両方に完全対応！クレジット消費なし）
    if (
      action === "suggest_setting" ||
      action === "random_preset" ||
      action === "generate_preset"
    ) {
      if (mode === "conte") {
        // 【コントメーカー用】のおもしろ設定生成
        const conteCategories = [
          "コンビニ・スーパー・ドラッグストアの接客で起きる面白おかしい人間ドラマコント",
          "警察の取調室・探偵事務所・職務質問でクセの強い犯人と刑事の掛け合いコント",
          "病院の診察室・手術室・歯医者で医者と患者のズレたやり取りコント",
          "学校の教室・職員室・進路相談で先生と生徒のシュールな学園コント",
          "高級レストラン・カフェ・寿司屋でウェイターや大将と客のすれ違いコント",
          "会社の最終面接・社長室・謝罪会見で立場が逆転していくオフィスコント",
          "銀行強盗・立てこもり現場で緊張と緩和が起きるコメディコント",
          "魔王城・勇者パーティー・時代劇で現代的な悩みを語り出すファンタジーコント",
          "タクシー車内・教習所・エレベーターの密室でクセの強い運転手と客のコント",
          "表参道の美容室・パーソナルジム・通販番組スタジオでキャラが暴走するコント",
          "終電の駅のホーム・実家のお茶の間でまさかの秘密が発覚する日常コント"
        ];
        const pickCat = conteCategories[Math.floor(Math.random() * conteCategories.length)];

        const contePresetPrompt = [
          "あなたはキングオブコントの優勝ネタを手掛けるプロのコント作家です。",
          `テーマ：「${pickCat}」`,
          "設定を見ただけで思わず見たくなるような、最高に面白くてユニークな『人間の登場人物2人』によるコント設定を1つ考案してください。",
          "登場人物には具体的な職業や立場がわかる人間の役名（例：クセが強すぎる新人店員, 普通に買い物したい客／例え話が不吉な医者, 不安になる患者 など）を設定してください。",
          "以下のJSON形式のみを出力してください（説明文やコードブロックは不要）。",
          '{ "theme": "具体的で面白い舞台・状況（20文字以内）", "genre": "作風・ジャンル（14文字以内）", "characters": "ボケ役の具体的な人間役名（14文字以内）, ツッコミ役の具体的な人間役名（14文字以内）" }'
        ].join("\n");

        const aiResp = await client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: "JSONのみを出力するプロのコント設定クリエイター" },
            { role: "user", content: contePresetPrompt }
          ]
        });

        const rawJson = String(aiResp?.choices?.[0]?.message?.content || "")
          .replace(/```(?:json)?/gi, "")
          .replace(/```/g, "")
          .trim();

        let parsed = null;
        try {
          const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawJson);
        } catch (_e) {
          parsed = null;
        }

        return res.status(200).json({
          ok: true,
          mode: "conte",
          theme: String(parsed?.theme || "深夜のコンビニ").trim(),
          genre: String(parsed?.genre || "日常×シュール").trim(),
          characters: String(parsed?.characters || "クセが強すぎる新人店員, 普通に買い物したい客").trim()
        });
      } else {
        // ★【漫才メーカー用】のおもしろ設定生成
        const manzaiCategories = [
          "日常のあるある（回転寿司・コンビニ・美容院・電車など）に奇抜な妄想や屁理屈が混ざるしゃべくり漫才",
          "理想のデート・プロポーズ・ヒーローインタビューなどを練習しようとして設定が崩壊するコント漫才",
          "昔話（桃太郎・浦島太郎）や歴史・映画のコンプライアンスや矛盾にイチャモンをつける風刺・考察漫才",
          "無人島に持っていくもの・タイムマシン・10億円当たったら等の定番テーマが斜め上に暴走する論理破綻漫才",
          "AI・最新テクノロジー・将来の夢・新しいビジネスなどを熱弁するボケと現実的なツッコミの掛け合い漫才",
          "小学校の運動会・修学旅行・部活の謎ルールを大人目線で振り返るハイテンポ漫才"
        ];
        const pickManzaiCat = manzaiCategories[Math.floor(Math.random() * manzaiCategories.length)];

        const manzaiPresetPrompt = [
          "あなたはM-1グランプリの優勝ネタを手掛けるプロの漫才作家です。",
          `方向性：「${pickManzaiCat}」`,
          "設定を見ただけで思わず漫才を聴きたくなるような、最高に面白くてユニークな漫才の「テーマ（theme）」「ジャンル・切り口（genre）」「ボケとツッコミ2人のキャラクター設定（characters）」を1組考案してください。",
          "以下のJSON形式のみを出力してください（説明文やコードブロックは不要）。",
          '{ "theme": "具体的で面白い漫才のテーマ（20文字以内）", "genre": "漫才の作風・切り口（14文字以内）", "characters": "ボケの個性的なキャラ設定（16文字以内）, ツッコミのキャラ設定（16文字以内）" }'
        ].join("\n");

        const aiResp = await client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: "JSONのみを出力するプロの漫才設定クリエイター" },
            { role: "user", content: manzaiPresetPrompt }
          ]
        });

        const rawJson = String(aiResp?.choices?.[0]?.message?.content || "")
          .replace(/```(?:json)?/gi, "")
          .replace(/```/g, "")
          .trim();

        let parsed = null;
        try {
          const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawJson);
        } catch (_e) {
          parsed = null;
        }

        return res.status(200).json({
          ok: true,
          mode: "manzai",
          theme: String(parsed?.theme || "無人島に1つだけ持っていくもの").trim(),
          genre: String(parsed?.genre || "しゃべくり漫才").trim(),
          characters: String(parsed?.characters || "屁理屈で変な日用品を推すボケ, 論破したいツッコミ").trim()
        });
      }
    }
    // 4. 通常生成（漫才 または コント）
    if (action !== "generate") {
      return res.status(400).json({ error: "Unknown action" });
    }

    // Assertion がある漫才生成は必ずサーバーで検証する。
    // 注: Assertion を付けないリクエストも互換性のため受理する暫定構成。
    let verifiedIOS = false;
    if (mode === "manzai" && body.app_attest) {
      const attestationResult = await verifyManzaiAssertion(body, body.app_attest);
      verifiedIOS = attestationResult?.verified === true;
    }

    const plan_type = String(body.plan_type || "").trim();
    const theme = String(body.theme || "").trim();
    const genre = String(body.genre || "").trim();
    const characters = body.characters ?? "";
    const length = Number(body.length || 1000);

    const rawSelected = body.selected || body.techniques || {};
    const selected = {
      boke: Array.isArray(rawSelected.boke)
        ? rawSelected.boke
        : Array.isArray(body.boke)
          ? body.boke
          : [],
      tsukkomi: Array.isArray(rawSelected.tsukkomi)
        ? rawSelected.tsukkomi
        : Array.isArray(body.tsukkomi)
          ? body.tsukkomi
          : [],
      general: Array.isArray(rawSelected.general)
        ? rawSelected.general
        : Array.isArray(body.general)
          ? body.general
          : []
    };

    const credit = await checkCredit(scopedUserId, plan_type, mode, verifiedIOS);
    if (!credit.ok) {
      return res.status(402).json({
        error: "クレジットが不足しています。",
        code: "INSUFFICIENT_CREDITS",
        mode,
        output_count: credit.row?.output_count ?? 0,
        paid_credits: credit.row?.paid_credits ?? 0
      });
    }

    const {
      systemPrompt,
      prompt,
      techniquesForMeta,
      structureMeta,
      minLen,
      maxLen,
      bokeName,
      tsukkomiName,
      targetLen,
      safeTheme,
      safeGenre,
      charDesc
    } = buildPromptByMode({ mode, theme, genre, characters, length, selected });

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    let raw = response?.choices?.[0]?.message?.content || "";
    raw = String(raw)
      .replace(/^```(?:text|markdown|txt)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const { cleanedRaw, stageStyle, leftCostume: aiLeftCostume, rightCostume: aiRightCostume } = extractStageMetaAndClean(raw);
    const leftCostume = mode === "conte" ? reconcileRoleCostume(bokeName, aiLeftCostume) : aiLeftCostume;
    const rightCostume = mode === "conte" ? reconcileRoleCostume(tsukkomiName, aiRightCostume) : aiRightCostume;

    let { title, body: generatedBody } = splitTitleAndBody(cleanedRaw);
    const normalized = ensureSingleTitle(title, generatedBody);

    title = normalized.title && normalized.title !== "無題" ? normalized.title : safeTheme;
    let bodyText = normalized.body;

    bodyText = normalizeSpeakerColons(bodyText);
    if (mode === "conte") {
      bodyText = canonicalizeConteSpeakerLabels(bodyText, bokeName, tsukkomiName);
    }
    bodyText = ensureBlankLineBetweenTurns(bodyText);
    bodyText = enforceCharLimit(bodyText, minLen, maxLen, true);

    if (mode === "manzai") {
      bodyText = ensureManzaiTsukkomiOutro(bodyText, tsukkomiName);
    }

    const consumption = await consumeAfterSuccess(scopedUserId, plan_type, mode, verifiedIOS);

    const fullSettingInfo = [
      safeTheme,
      safeGenre,
      charDesc,
      stageStyle ? `STAGE:${stageStyle}` : "",
      leftCostume ? `LEFT_COSTUME:${leftCostume}` : "",
      rightCostume ? `RIGHT_COSTUME:${rightCostume}` : "",
      mode === "conte" ? `LEFT_ROLE:${bokeName.replace(/[|\r\n]/g, " ")}` : "",
      mode === "conte" ? `RIGHT_ROLE:${tsukkomiName.replace(/[|\r\n]/g, " ")}` : ""
    ].filter(Boolean).join(" | ");

    return res.status(200).json({
      ok: true,
      mode,
      title,
      body: bodyText,
      text: bodyText,
      script: bodyText,
      setting: fullSettingInfo,
      techniques: techniquesForMeta,
      structure: structureMeta,
      meta: {
        mode,
        setting: fullSettingInfo,
        stage_style: stageStyle,
        left_costume: leftCostume,
        right_costume: rightCostume,
        left_role: mode === "conte" ? bokeName : "",
        right_role: mode === "conte" ? tsukkomiName : "",
        structure: structureMeta,
        techniques: techniquesForMeta,
        usage_count: consumption.output_count ?? 0,
        paid_credits: consumption.paid_credits ?? 0
      },
      target_length: targetLen,
      min_length: minLen,
      max_length: maxLen,
      tsukkomi_outro: mode === "manzai" ? `${tsukkomiName}: もういいよ！` : "",
      consumed: consumption.consumed ?? null
    });
  } catch (err) {
    console.error("[openai error raw]", err);
    console.error("[openai error cause]", err?.cause);
    const e = normalizeError(err);
    console.error("[openai error normalized]", e);

    return res.status(e.status || 500).json({
      error: "OpenAI request failed",
      detail: e,
      cause: err?.cause
        ? {
            name: err.cause.name,
            message: err.cause.message,
            code: err.cause.code,
            errno: err.cause.errno,
            syscall: err.cause.errno,
            hostname: err.cause.hostname
          }
        : null
    });
  }
}