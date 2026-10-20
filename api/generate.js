// api/generate.js
export const config = { runtime: "nodejs" };

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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

function resolveQuotaByPlan(plan_type = "") {
  if (plan_type === "ios_unlimited" || plan_type === "conte_ios_unlimited") return FREE_QUOTA_IOS_NEW;
  if (plan_type === "android_free_10" || plan_type === "conte_android_free_10") return FREE_QUOTA_ANDROID_AD;
  return FREE_QUOTA_DEFAULT;
}

async function getUsageRow(scoped_user_id) {
  if (!hasSupabase || !scoped_user_id) {
    return { output_count: 0, paid_credits: 0 };
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
    console.warn("[supabase] getUsageRow failed, bypassing credit check:", e?.message || e);
    return { output_count: 0, paid_credits: 0 };
  }
}

async function setUsageRow(scoped_user_id, { output_count, paid_credits }) {
  if (!hasSupabase || !scoped_user_id) return;

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
    console.warn("[supabase] setUsageRow failed:", e?.message || e);
  }
}

async function checkCredit(scoped_user_id, plan_type = "") {
  if (!hasSupabase || !scoped_user_id) {
    return { ok: true, row: null };
  }

  const row = await getUsageRow(scoped_user_id);
  const used = row.output_count ?? 0;
  const paid = row.paid_credits ?? 0;
  const quota = resolveQuotaByPlan(plan_type);

  return {
    ok: used < quota || paid > 0,
    row
  };
}

async function consumeAfterSuccess(scoped_user_id, plan_type = "") {
  if (!hasSupabase || !scoped_user_id) {
    return { consumed: null, output_count: 0, paid_credits: 0 };
  }

  try {
    const row = await getUsageRow(scoped_user_id);
    const used = row.output_count ?? 0;
    const paid = row.paid_credits ?? 0;
    const nextUsed = used + 1;

    const isIosUnlimitedPlan = plan_type === "ios_unlimited" || plan_type === "conte_ios_unlimited";
    const quota = resolveQuotaByPlan(plan_type);

    if ((isIosUnlimitedPlan && paid > 0) || paid >= UNLIMITED_FLAG_VALUE) {
      await setUsageRow(scoped_user_id, {
        output_count: nextUsed,
        paid_credits: paid
      });
      return {
        consumed: "unlimited",
        output_count: nextUsed,
        paid_credits: paid
      };
    }

    if (used < quota) {
      await setUsageRow(scoped_user_id, {
        output_count: nextUsed,
        paid_credits: paid
      });
      return {
        consumed: "free",
        output_count: nextUsed,
        paid_credits: paid
      };
    }

    if (paid > 0) {
      const nextPaid = paid - 1;
      await setUsageRow(scoped_user_id, {
        output_count: nextUsed,
        paid_credits: nextPaid
      });
      return {
        consumed: "paid",
        output_count: nextUsed,
        paid_credits: nextPaid
      };
    }

    return {
      consumed: null,
      output_count: used,
      paid_credits: paid
    };
  } catch (e) {
    console.warn("[supabase] consumeAfterSuccess failed, credits NOT decremented:", e?.message || e);
    return {
      consumed: null,
      output_count: 0,
      paid_credits: 0,
      error: e?.message || String(e)
    };
  }
}

const PRODUCT_CREDIT_100 = "credit_100";
const PRODUCT_UNLIMITED = "unlimited_unlock";
const CREDIT_100_AMOUNT = 100;

async function addCreditsForPurchase(scoped_user_id, product_id) {
  if (!scoped_user_id) {
    throw new Error("user_id missing");
  }

  const row = await getUsageRow(scoped_user_id);
  const paid = row.paid_credits ?? 0;
  let nextPaid = paid;

  if (product_id === PRODUCT_CREDIT_100) {
    nextPaid = paid + CREDIT_100_AMOUNT;
  } else if (product_id === PRODUCT_UNLIMITED) {
    nextPaid = UNLIMITED_FLAG_VALUE;
  } else {
    const err = new Error("Unsupported product_id");
    err.status = 400;
    throw err;
  }

  await setUsageRow(scoped_user_id, {
    output_count: row.output_count ?? 0,
    paid_credits: nextPaid
  });

  return nextPaid;
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
  if (!charDesc) return { bokeName: "A", tsukkomiName: "B" };
  const parts = String(charDesc)
    .split(/[、,，／/・\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const cleanName = (raw) =>
      raw.replace(/[（(].*?[）)]/g, "").replace(/^(ボケ|ツッコミ|ボケ役|ツッコミ役)[:：]\s*/, "").trim();
    const n1 = cleanName(parts[0]) || "A";
    const n2 = cleanName(parts[1]) || "B";
    return { bokeName: n1, tsukkomiName: n2 };
  }
  return { bokeName: "A", tsukkomiName: "B" };
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

  // ★ コント専用プロンプト（人間・動物・物の配役コード対応＋シュール＆面白さ強化）
  if (isConte) {
    const systemPrompt = [
      "あなたはキングオブコントの優勝ネタを数多く手掛ける天才コント作家です。",
      "舞台でそのまま演じられる、最高に面白おかしくて笑える日本語のコント（寸劇）台本を作成してください。",
      "説明やト書きではなく、指定された舞台メタ情報とタイトル、完成したセリフの掛け合いだけを出力してください。",
      "登場人物に『動物（犬・猫・パンダ・タコ・ペンギン・宇宙人など）』や『物（冷蔵庫・スマホ・おにぎり・りんご・信号機・聖剣・トイレ・ロボットなど）』が含まれている場合は、その動物の習性や、無機物ならではの機能・視点（冷やす、充電が減る、食べられる恐怖、扉を開け閉めされる等）をフル活用したシュールで抱腹絶倒のボケとツッコミを展開してください。",
      "2人は基本的には定位置で立ち止まって会話し、詰め寄る・逃げる・隠れる・作業するなど『動きに明確な意味がある場面』でのみ移動タグを使ってください。"
    ].join("\n");

    const costumeCodesList = [
      "【人間の衣装】CLERK_APRON / SHOPPER_BAG / POLICE_DETECTIVE / SUSPECT_GLASSES / DOCTOR_COAT / PATIENT_BANDAGE / TEACHER_POINTER / STUDENT_CAP / WAITER_TRAY / CAFE_GUEST_MENU / BOSS_RED_TIE / APPLICANT_BLUE_TIE / ROBBER_MASK / HERO_SWORD / DEMON_MAGE_STAFF / DRIVER_CAP / CHEF_HAT / BARBER_SCISSORS / ATHLETE_HEADBAND / MC_MIC / STATION_STAFF / CASUAL_PLAIN",
      "【動物の姿】ANIMAL_DOG (犬・狼) / ANIMAL_CAT (猫・虎・ライオン) / ANIMAL_BEAR_PANDA (クマ・パンダ・ゴリラ・猿) / ANIMAL_RABBIT (ウサギ) / ANIMAL_BIRD_PENGUIN (鳥・ペンギン・ニワトリ) / ANIMAL_OCTOPUS (タコ・イカ・海洋生物) / ANIMAL_ALIEN (宇宙人・地球外生命体)",
      "【物の姿】OBJECT_FRIDGE (冷蔵庫・テレビ・電子レンジ等の四角い家電) / OBJECT_SMARTPHONE (スマホ・パソコン・時計) / OBJECT_APPLE (りんご・トマト・みかん等の丸い食べ物) / OBJECT_ONIGIRI (おにぎり・寿司・パン等の食べ物) / OBJECT_TRAFFIC_LIGHT (信号機・標識) / OBJECT_SWORD (剣・文房具・傘・ハサミ等の細長い道具) / OBJECT_TOILET (トイレ・便器・日用品) / OBJECT_ROBOT (AIロボット・掃除機ロボ・メカ)"
    ].join("\n");

    const prompt = [
      "以下の条件で、日本語のコント（寸劇）台本を1本作成してください。",
      "",
      `【シチュエーション・舞台設定】${safeTheme}`,
      `【ジャンル・作風】${safeGenre}`,
      `【登場人物・配役】${charDesc || `${bokeName}（ボケ役）、${tsukkomiName}（ツッコミ役）`}`,
      `※左側のボケ役を「${bokeName}」、右側のツッコミ役を「${tsukkomiName}」として台詞を書いてください。`,
      `【目標文字数】${targetLen}文字（${minLen}〜${maxLen}文字程度）`,
      "",
      "【採用するコント技法】",
      techniqueText,
      "",
      guideline ? "【技法ガイドライン】\n" + guideline : "",
      "",
      "【舞台セットと演者の姿・衣装の指定（最優先・必須）】",
      "アプリのステージ背景と2人の姿（人間・動物・物）を完全一致させるため、出力の一番最初（タイトルの前）に以下の3行を必ず出力してください。",
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
      const product_id = String(body.product_id || "").trim();

      if (!scopedUserId) {
        return res.status(400).json({ error: "user_id is required" });
      }
      if (!product_id) {
        return res.status(400).json({ error: "product_id is required" });
      }

      const paidCredits = await addCreditsForPurchase(scopedUserId, product_id);

      return res.status(200).json({
        ok: true,
        mode,
        user_id: rawUserId,
        scoped_user_id: scopedUserId,
        product_id,
        paid_credits: paidCredits
      });
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

    // ★ 3. AIによる「おまかせ設定（カオス設定＆動物・物の珍配役ガチャ）」自動生成
    if (action === "random_preset" || action === "generate_preset") {
      const categories = [
        "【擬人化・物×人間】コンビニの廃棄寸前のおにぎりや冷蔵庫・スマホ・信号機・手術室のメスなどが急に喋り出して人間に文句を言うコント",
        "【動物×人間】警察の取調室や会社の採用面接・タクシー・美容室なのに、片方がどう見ても『喋る犬・猫・ゴリラ・タコ・パンダ・ペンギン』なコント",
        "【物×物・動物×物】真夜中のキッチンで『毒舌な冷蔵庫と飼い猫』や『意識高い系のりんごと賞味期限切れのおにぎり』『充電2%のスマホとAIロボット』が言い争うコント",
        "【カオス立場逆転】銀行強盗・魔王城・病院の手術室・高級フレンチなどで、絶対にありえない異常事態や立場の逆転が起きる爆笑コント"
      ];
      const pickCat = categories[Math.floor(Math.random() * categories.length)];

      const presetPrompt = [
        "あなたはキングオブコントの優勝ネタを手掛ける日本一のコント作家です。",
        `テーマ方向性：「${pickCat}」`,
        "設定を見ただけで思わず吹き出してしまうような、最高に面白おかしくてシュールな2人コントの設定を1つ考案してください。",
        "登場人物には人間だけでなく『動物（犬・猫・パンダ・ゴリラ・タコ・ペンギン・宇宙人など）』や『物（冷蔵庫・スマホ・りんご・おにぎり・信号機・聖剣・トイレ・ロボットなど）』を積極的に配役に任命してください。",
        "以下のJSON形式のみを出力してください（説明文やコードブロックは不要）。",
        '{ "theme": "具体的で面白い舞台・異常な状況（22文字以内）", "genre": "作風・ジャンル（14文字以内）", "characters": "ボケ役の具体的な役名（15文字以内）, ツッコミ役の具体的な役名（15文字以内）" }'
      ].join("\n");

      const aiResp = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: "JSONのみを出力する天才コント設定クリエイター" },
          { role: "user", content: presetPrompt }
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
        theme: String(parsed?.theme || "深夜のコンビニ・廃棄寸前の棚").trim(),
        genre: String(parsed?.genre || "擬人化×シュール").trim(),
        characters: String(parsed?.characters || "プライドが高すぎる高級おにぎり, 値引きシールを貼る店員").trim()
      });
    }

    // 4. 通常生成（漫才 または コント）
    if (action !== "generate") {
      return res.status(400).json({ error: "Unknown action" });
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

    const credit = await checkCredit(scopedUserId, plan_type);
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

    const { cleanedRaw, stageStyle, leftCostume, rightCostume } = extractStageMetaAndClean(raw);

    let { title, body: generatedBody } = splitTitleAndBody(cleanedRaw);
    const normalized = ensureSingleTitle(title, generatedBody);

    title = normalized.title && normalized.title !== "無題" ? normalized.title : safeTheme;
    let bodyText = normalized.body;

    bodyText = normalizeSpeakerColons(bodyText);
    bodyText = ensureBlankLineBetweenTurns(bodyText);
    bodyText = enforceCharLimit(bodyText, minLen, maxLen, true);

    if (mode === "manzai") {
      bodyText = ensureManzaiTsukkomiOutro(bodyText, tsukkomiName);
    }

    const consumption = await consumeAfterSuccess(scopedUserId, plan_type);

    const fullSettingInfo = [
      safeTheme,
      safeGenre,
      charDesc,
      stageStyle ? `STAGE:${stageStyle}` : "",
      leftCostume ? `LEFT_COSTUME:${leftCostume}` : "",
      rightCostume ? `RIGHT_COSTUME:${rightCostume}` : ""
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