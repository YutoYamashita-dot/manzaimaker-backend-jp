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
Supabase / Credit
（Androidの500回+100クレジット方式 と iOSの3回+買い切り方式の両対応）
========================= */

const FREE_QUOTA_DEFAULT = 500;
const FREE_QUOTA_IOS_NEW = 3;
const UNLIMITED_FLAG_VALUE = 999999;

async function incrementUsage(user_id, delta = 1) {
  if (!hasSupabase || !user_id) return null;

  try {
    const { data, error } = await supabase
      .from("user_usage")
      .select("output_count")
      .eq("user_id", user_id)
      .maybeSingle();

    if (error) throw error;

    const current = data?.output_count ?? 0;
    const next = current + Math.max(delta, 0);

    const { error: upErr } = await supabase
      .from("user_usage")
      .upsert({
        user_id,
        output_count: next,
        updated_at: new Date().toISOString()
      });

    if (upErr) throw upErr;
    return next;
  } catch (e) {
    console.warn("[supabase] incrementUsage failed:", e?.message || e);
    return null;
  }
}

async function getUsageRow(user_id) {
  if (!hasSupabase || !user_id) {
    return { output_count: 0, paid_credits: 0 };
  }

  try {
    const { data, error } = await supabase
      .from("user_usage")
      .select("output_count, paid_credits")
      .eq("user_id", user_id)
      .maybeSingle();

    if (error) throw error;

    return data || { output_count: 0, paid_credits: 0 };
  } catch (e) {
    console.warn("[supabase] getUsageRow failed, bypassing credit check:", e?.message || e);
    return { output_count: 0, paid_credits: 0 };
  }
}

async function setUsageRow(user_id, { output_count, paid_credits }) {
  if (!hasSupabase || !user_id) return;

  try {
    const { error } = await supabase
      .from("user_usage")
      .upsert({
        user_id,
        output_count,
        paid_credits,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (e) {
    console.warn("[supabase] setUsageRow failed:", e?.message || e);
  }
}

async function checkCredit(user_id, plan_type = "") {
  if (!hasSupabase || !user_id) {
    return { ok: true, row: null };
  }

  const row = await getUsageRow(user_id);
  const used = row.output_count ?? 0;
  const paid = row.paid_credits ?? 0;

  const quota = plan_type === "ios_unlimited"
    ? FREE_QUOTA_IOS_NEW
    : FREE_QUOTA_DEFAULT;

  return {
    ok: used < quota || paid > 0,
    row
  };
}

async function consumeAfterSuccess(user_id, plan_type = "") {
  if (!hasSupabase || !user_id) {
    return { consumed: null, output_count: 0, paid_credits: 0 };
  }

  try {
    const row = await getUsageRow(user_id);
    const used = row.output_count ?? 0;
    const paid = row.paid_credits ?? 0;
    const nextUsed = used + 1;

    const isIosUnlimitedPlan = plan_type === "ios_unlimited";
    const quota = isIosUnlimitedPlan ? FREE_QUOTA_IOS_NEW : FREE_QUOTA_DEFAULT;

    // 1. iOS買い切り済み or 無制限フラグ値の場合は paid_credits を減らさない
    if ((isIosUnlimitedPlan && paid > 0) || paid >= UNLIMITED_FLAG_VALUE) {
      await setUsageRow(user_id, {
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
      await setUsageRow(user_id, {
        output_count: nextUsed,
        paid_credits: paid
      });
      return {
        consumed: "free",
        output_count: nextUsed,
        paid_credits: paid
      };
    }

    // 3. Android等の従来型・有料クレジット消費（-1）
    if (paid > 0) {
      const nextPaid = paid - 1;
      await setUsageRow(user_id, {
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

async function addCreditsForPurchase(user_id, product_id) {
  if (!user_id) {
    throw new Error("user_id missing");
  }

  const row = await getUsageRow(user_id);
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

  await setUsageRow(user_id, {
    output_count: row.output_count ?? 0,
    paid_credits: nextPaid
  });

  return nextPaid;
}

/* =========================
技法定義
========================= */

const BOKE_DEFS = {
  IIMACHIGAI: "言い間違い／聞き間違い：音韻のズレで意外性を生むボケ。",
  HIYU: "比喩ボケ：比喩で誇張してのボケ",
  GYAKUSETSU: "逆説ボケ：一見正論に聞こえるが論理が破綻しているボケ。",
  GIJI_RONRI: "擬似論理ボケ：論理風だが中身がズレているボケ。",
  TSUKKOMI_BOKE: "ツッコミボケ：ツッコミの発言が次のボケの伏線になるボケ。",
  RENSA: "ボケの連鎖：ボケが次のボケを誘発するように連続させ、加速感を生むボケ。",
  KOTOBA_ASOBI: "言葉遊び：ダジャレ・韻などで言語的にふざける。"
};

const TSUKKOMI_DEFS = {
  ODOROKI_GIMON: "驚き・疑問ツッコミ：観客の代弁として即時の驚き・疑問でのツッコミ。",
  AKIRE_REISEI: "呆れ・冷静ツッコミ：感情を抑えた冷静な態度でのツッコミ。",
  OKORI: "怒りツッコミ：怒ったような言い方でのツッコミ。",
  KYOKAN: "共感ツッコミ：相手の感情に一度共感してから、ツッコミをする。",
  META: "メタツッコミ：漫才の形式・構造そのものを指摘するツッコミ。"
};

const GENERAL_DEFS = {
  SANDAN_OCHI: "三段オチ：1・2をフリ、3で意外なオチ。",
  GYAKUHARI: "逆張り構成：期待・常識を外して予想を逆手に取る。",
  TENKAI_HAKAI: "展開破壊：築いた流れを意図的に壊し異質な要素を挿入。",
  KANCHIGAI_TEISEI: "勘違い→訂正：ボケの勘違いをツッコミが訂正する構成。",
  SURECHIGAI: "すれ違い：互いの前提が噛み合わずズレ続けて笑いを生む。",
  TACHIBA_GYAKUTEN: "立場逆転：途中または終盤で役割・地位がひっくり返る。"
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
  "tachibaGyakuten": "TACHIBA_GYAKUTEN"
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
文字数・整形ユーティリティ
========================= */

function enforceCharLimit(text, minLen, maxLen, allowOverflow = false) {
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

function ensureTsukkomiOutro(text, tsukkomiName = "B") {
  const outro = `${tsukkomiName}: もういいよ！`;
  if (!text) return outro;

  let t = text.trim();
  const endPattern = /(?:^|\n)(?:[^:\n]+:\s*)?もういいよ[！!]*\s*$/;

  while (endPattern.test(t)) {
    t = t.replace(endPattern, "").trim();
  }

  return t ? `${t}\n${outro}` : outro;
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

  // 最初の1行目がすでに「A: 〜」などセリフから始まっている場合はタイトルなしとして全文を本文にする
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
ガイドライン・プロンプト作成
========================= */

function buildGuidelineFromSelections({ boke = [], tsukkomi = [], general = [] }) {
  const bokeLines = boke
    .map((k) => {
      const key = resolveTechKey(k, BOKE_DEFS);
      return key ? `- ${BOKE_DEFS[key]}` : `- ${k}`;
    })
    .filter(Boolean);

  const tsukkomiLines = tsukkomi
    .map((k) => {
      const key = resolveTechKey(k, TSUKKOMI_DEFS);
      return key ? `- ${TSUKKOMI_DEFS[key]}` : `- ${k}`;
    })
    .filter(Boolean);

  const generalLines = general
    .map((k) => {
      const key = resolveTechKey(k, GENERAL_DEFS);
      return key ? `- ${GENERAL_DEFS[key]}` : `- ${k}`;
    })
    .filter(Boolean);

  const parts = [];
  if (bokeLines.length) parts.push("【ボケ技法】", ...bokeLines);
  if (tsukkomiLines.length) parts.push("【ツッコミ技法】", ...tsukkomiLines);
  if (generalLines.length) parts.push("【全般の構成技法】", ...generalLines);

  return parts.join("\n");
}

function labelizeSelected({ boke = [], tsukkomi = [], general = [] }) {
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

  return {
    boke: toLabel(boke, BOKE_DEFS),
    tsukkomi: toLabel(tsukkomi, TSUKKOMI_DEFS),
    general: toLabel(general, GENERAL_DEFS)
  };
}

function buildPrompt({ theme = "", genre = "", characters = "", length = 1000, selected = {} }) {
  const boke = Array.isArray(selected.boke) ? selected.boke : [];
  const tsukkomi = Array.isArray(selected.tsukkomi) ? selected.tsukkomi : [];
  const general = Array.isArray(selected.general) ? selected.general : [];

  const selectedLabels = labelizeSelected({ boke, tsukkomi, general });
  const guideline = buildGuidelineFromSelections({ boke, tsukkomi, general });

  const techniquesForMeta = [
    ...selectedLabels.boke,
    ...selectedLabels.tsukkomi,
    ...selectedLabels.general
  ];

  const structureMeta = [...selectedLabels.general];

  const safeTheme = String(theme || "").trim() || "日常生活";
  const safeGenre = String(genre || "").trim() || "漫才";
  const charDesc = typeof characters === "string"
    ? characters.trim()
    : JSON.stringify(characters ?? "");

  const targetLen = Number.isFinite(Number(length)) && Number(length) > 0
    ? Math.floor(Number(length))
    : 1000;

  const minLen = Math.max(1, Math.floor(targetLen * 0.9));
  const maxLen = Math.max(minLen, Math.ceil(targetLen * 1.1));
  const tsukkomiName = "B";

  const techniqueText = techniquesForMeta.length
    ? techniquesForMeta.join("、")
    : "指定なし";

  const prompt = [
    "以下の条件で、日本語の漫才台本を1本作成してください。",
    "",
    `【題材】${safeTheme}`,
    `【ジャンル】${safeGenre}`,
    `【登場人物】${charDesc || "A: ボケ、B: ツッコミ"}`,
    `【目標文字数】${targetLen}文字`,
    `【許容文字数】${minLen}〜${maxLen}文字程度`,
    "",
    "【採用する技法】",
    techniqueText,
    "",
    guideline ? "【技法ガイドライン】\n" + guideline : "",
    "",
    "【出力ルール】",
    "- タイトルを最初に1つだけ出す。",
    "- タイトルと本文の間には空行を1つ入れる。",
    "- 本文は「名前: セリフ」の形式にする。",
    "- 各台詞の間には空行を1つ入れる。",
    "- 解説、分析、制作意図、技法名の説明は出力しない。",
    "- 技法名そのものを台詞にしない。",
    `- 最後は必ず ${tsukkomiName}: もういいよ！ で締める。`,
    "- 固有名詞や具体的な数字を使い、抽象的な表現を避ける。",
    "- 舞台でそのまま使える自然な掛け合いにする。"
  ].join("\n");

  return {
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
OpenAI クライアント
========================= */

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

        // 推論トークン(Reasoning)で上限に達して本文が空になるのを防ぐため十分なトークン枠を確保
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
メイン handler
========================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = req.body || {};
    const action = body.action || "generate";

    // 1. 購入クレジット追加 / 買い切りアンロック
    if (action === "add_credits" || action === "add_credit") {
      const user_id = String(body.user_id || "").trim();
      const product_id = String(body.product_id || "").trim();

      if (!user_id) {
        return res.status(400).json({ error: "user_id is required" });
      }
      if (!product_id) {
        return res.status(400).json({ error: "product_id is required" });
      }

      const paidCredits = await addCreditsForPurchase(user_id, product_id);

      return res.status(200).json({
        ok: true,
        user_id,
        product_id,
        paid_credits: paidCredits
      });
    }

    // 2. 通常生成
    if (action !== "generate") {
      return res.status(400).json({ error: "Unknown action" });
    }

    const user_id = String(body.user_id || "").trim();
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

    // クレジット確認
    const credit = await checkCredit(user_id, plan_type);
    if (!credit.ok) {
      return res.status(402).json({
        error: "クレジットが不足しています。",
        code: "INSUFFICIENT_CREDITS",
        output_count: credit.row?.output_count ?? 0,
        paid_credits: credit.row?.paid_credits ?? 0
      });
    }

    // プロンプト作成
    const {
      prompt,
      techniquesForMeta,
      structureMeta,
      minLen,
      maxLen,
      tsukkomiName,
      targetLen,
      safeTheme
    } = buildPrompt({ theme, genre, characters, length, selected });

    // 漫才生成（1回の呼び出しで完了させる）
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "あなたはプロの漫才作家です。",
            "舞台でそのまま使える、日本語の漫才台本を作成してください。",
            "説明や分析ではなく、完成した台本だけを出力してください。",
            "必ず自然な掛け合いと明確なオチを作ってください。",
            "緊張と緩和などのお笑い理論やテクニックを駆使した台本にしてください。"
          ].join("\n")
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
    bodyText = enforceCharLimit(bodyText, minLen, maxLen, false);
    bodyText = ensureTsukkomiOutro(bodyText, tsukkomiName);

    // クレジット消費
    const consumption = await consumeAfterSuccess(user_id, plan_type);

    return res.status(200).json({
      ok: true,
      title,
      body: bodyText,
      text: bodyText,
      script: bodyText,
      techniques: techniquesForMeta,
      structure: structureMeta,
      meta: {
        structure: structureMeta,
        techniques: techniquesForMeta,
        usage_count: consumption.output_count ?? 0,
        paid_credits: consumption.paid_credits ?? 0
      },
      target_length: targetLen,
      min_length: minLen,
      max_length: maxLen,
      tsukkomi_outro: `${tsukkomiName}: もういいよ！`,
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
            syscall: err.cause.syscall,
            hostname: err.cause.hostname
          }
        : nullgit
    });
  }
}