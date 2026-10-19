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

// リクエスト内容から「コント(conte)」か「漫才(manzai)」かを自動判定
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

  // 選択された技法名にコント専用技法が含まれている場合もコントと判定
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

// ★ 漫才とコントで Supabase 上のクレジット記録を完全に分けるため、
//    コント時は user_id の先頭に "conte_" を付与する（漫才時はそのまま）
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

    // 1. iOS買い切り済み or 無制限フラグ値の場合は paid_credits を減らさない
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

    // 2. 無料枠内の消費
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

    // 3. 有料クレジット消費（-1）
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
  // 漫才用エイリアス
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

  // コント用エイリアス
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

  // iPhone版コントメーカーが付与した補助文「（※漫才ではなく〜）」があれば綺麗に除去して題材名を取り出す
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
      "あなたはキングオブコントの優勝ネタを数多く手掛けるプロのコント作家です。",
      "舞台でそのまま演じられる、日本語のコント（寸劇）台本を作成してください。",
      "説明やト書きではなく、完成したセリフの掛け合いだけを出力してください。",
      "最初は日常的なシチュエーションから始まり、徐々にキャラクターの狂気やズレがエスカレートし、最後は鮮やかなオチで暗転する構成にしてください。",
      "アプリのステージ演出（全身アクション・効果音）と連携するため、指定された演出タグを各セリフの先頭に必ず付けてください。"
    ].join("\n");

    const prompt = [
      "以下の条件で、日本語のコント（寸劇）台本を1本作成してください。",
      "",
      `【シチュエーション・舞台設定】${safeTheme}`,
      `【ジャンル・作風】${safeGenre}`,
      `【登場人物・役柄】${charDesc || `${bokeName}（ボケ役）、${tsukkomiName}（ツッコミ役）`}`,
      `※左側のボケ役を「${bokeName}」、右側のツッコミ役を「${tsukkomiName}」として台詞を書いてください。`,
      `【目標文字数】${targetLen}文字（${minLen}〜${maxLen}文字程度）`,
      "",
      "【採用するコント技法】",
      techniqueText,
      "",
      guideline ? "【技法ガイドライン】\n" + guideline : "",
      "",
      "【アプリ上演用の演出タグルール（重要）】",
      "アプリ内でキャラクターが全身アクション・表情・効果音をつけるため、各セリフのコロン（:）の直後に、文脈に合った以下の演出タグを1つ付けてください。",
      "- [通常] ：普通の会話や状況説明のセリフ（例: `A: [通常] すみません、これ温めてもらえますか？`）",
      "- [ボケ] ：おどけたボケ、ズレた発言、奇妙な言動（例: `A: [ボケ] 僕、昨日から光合成だけで生きてるんですよ♪`）",
      "- [演技] ：役柄になりきった芝居がかったセリフ、小道具を使うセリフ（例: `A: [演技] 「これよりオペを開始する！」…よし、メス！`）",
      "- [キメ] ：ドヤ顔でカッコつける、謎のキメポーズをとるセリフ（例: `A: [キメ] フッ…何を隠そう、俺は伝説のコンビニ店員だ。`）",
      "- [疑問] ：首をかしげる疑問や戸惑いの問いかけ（例: `B: [疑問] えっ、それどういう意味ですか？`）",
      "- [呆れ] ：呆れたツッコミ、小声やため息混じりの冷静な指摘（例: `B: [呆れ] いや…あなたさっきから何言ってるんですか…。`）",
      "- [ツッコミ] ：通常の勢いあるツッコミ・指摘（例: `B: [ツッコミ] いや逆でしょ！何やってんの！`）",
      "- [叩く] ：コント後半のクライマックスに入れる「ここぞという渾身の強ツッコミ」（※台本全体で1〜2回だけに厳選！）",
      "- [ズッコケ] ：相手のあんまりなボケに拍子抜けして新喜劇風にズッコケるリアクション（例: `B: [ズッコケ] 知らんのかい！ズコーッ！`）",
      "- [詰め寄る] ：相手の目の前までグッと顔を近づけて迫る・凄むセリフ（例: `B: [詰め寄る] おい、本当のことを白状しろよ…。`）",
      "- [パニック] ：恐怖や混乱で顔面蒼白になりガタガタ震えるセリフ（例: `B: [パニック] ひぃぃぃ！ヤバいってこれ！助けてくれー！`）",
      "- [土下座] ：床に頭を擦り付けて必死に謝罪・懇願するセリフ（例: `A: [土下座] すいませんでしたー！どうか命だけはー！`）",
      "",
      "【コントの出力ルール（厳守）】",
      "- 漫才ではないため、冒頭の「どうもー！」や、最後の「もういいよ！」「もうええわ！」「ありがとうございました」は絶対に入れないでください。",
      "- 照明が明転した瞬間から、すでにそのシチュエーションの役に入り込んだ第一声で始めてください。",
      "- タイトルを最初に1つだけ出す（【】や「タイトル:」は付けずタイトル文字列のみ）。",
      "- タイトルと本文の間には空行を1つ入れる。",
      `- 本文は必ず「${bokeName}: [タグ] セリフ」「${tsukkomiName}: [タグ] セリフ」の形式にする。`,
      "- 各台詞の間には空行を1つ入れる。",
      "- 解説やト書きは一切出力せず、最後はコントらしい鮮やかで面白いオチのセリフ（暗転のキッカケになる一言）でピタッと終える。"
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
    "- [通常] ：普通の会話やフリのセリフ（例: `A: [通常] 最近ちょっと悩みがありましてね。`）",
    "- [ボケ] ：おどけたボケ、アホな発言、ズレた発言（例: `A: [ボケ] だから僕、昨日から光合成だけで生きてるんです♪`）",
    "- [演技] ：コント風のなりきり、モノマネ、カギカッコ付きのセリフ（例: `A: [演技] 「いらっしゃいませー！ご注文は？」ってね。`）",
    "- [疑問] ：首をかしげる疑問や問いかけ（例: `B: [疑問] えっ、それどういうことなん？`）",
    "- [呆れ] ：呆れたツッコミ、ため息混じりの冷静な指摘（例: `B: [呆れ] いや…お前それ本気で言うてんの…？`）",
    "- [ツッコミ] ：通常の勢いあるツッコミ・指摘（例: `B: [ツッコミ] いや逆やろ！何してんねん！`）",
    "- [叩く] ：ネタ後半のクライマックスや決定的な瞬間、または最後の締めに入れる「ここぞという渾身の強ツッコミ」（※台本全体で1〜2回だけに厳選すること！ 例: `B: [叩く] なんでやねん！いい加減にしろ！`）",
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

    // ★ 漫才("manzai") か コント("conte") かを判定し、コントなら user_id を "conte_..." に分離する
    const mode = detectAppMode(body);
    const rawUserId = String(body.user_id || "").trim();
    const scopedUserId = resolveScopedUserId(rawUserId, mode);

    // 1. 購入クレジット追加 / 買い切りアンロック（漫才・コントそれぞれの枠に加算）
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

    // 2. クレジット残高照会（action: "get_credit" が投げられた場合にも対応）
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

    // 3. 通常生成（漫才 または コント）
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

    // クレジット確認（漫才用・コント用で独立した scopedUserId でチェック）
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

    // モード別プロンプト作成
    const {
      systemPrompt,
      prompt,
      techniquesForMeta,
      structureMeta,
      minLen,
      maxLen,
      tsukkomiName,
      targetLen,
      safeTheme
    } = buildPromptByMode({ mode, theme, genre, characters, length, selected });

    // OpenAI 呼び出し
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

    // タイトルと本文を分離
    let { title, body: generatedBody } = splitTitleAndBody(raw);
    const normalized = ensureSingleTitle(title, generatedBody);

    title = normalized.title && normalized.title !== "無題" ? normalized.title : safeTheme;
    let bodyText = normalized.body;

    // 整形
    bodyText = normalizeSpeakerColons(bodyText);
    bodyText = ensureBlankLineBetweenTurns(bodyText);
    bodyText = enforceCharLimit(bodyText, minLen, maxLen, true);

    // ★ 漫才モードの時だけ末尾に「もういいよ！」を保証し、コントモードの時はオチのセリフでピタッと終える！
    if (mode === "manzai") {
      bodyText = ensureManzaiTsukkomiOutro(bodyText, tsukkomiName);
    }

    // クレジット消費（漫才・コントそれぞれの枠で消費）
    const consumption = await consumeAfterSuccess(scopedUserId, plan_type);

    return res.status(200).json({
      ok: true,
      mode,
      title,
      body: bodyText,
      text: bodyText,
      script: bodyText,
      techniques: techniquesForMeta,
      structure: structureMeta,
      meta: {
        mode,
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