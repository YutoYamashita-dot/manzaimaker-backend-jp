// api/generate.js

// Vercel Node.js (ESM)。本文と「タイトル」を日本語で返す（台本のみ）

// 必須: OPENAI_API_KEY
// 任意: OPENAI_MODEL
// 追加: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// （ある場合、user_id の回数/クレジットを保存）

export const config = { runtime: "nodejs" };

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

/* =========================
Supabase Client
========================= */

const SUPABASE_URL =
  process.env.SUPABASE_URL || "";

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const hasSupabase =
  !!(SUPABASE_URL && SUPABASE_KEY);

const supabase =
  hasSupabase
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

/* =========================
既存互換ユーティリティ（そのまま維持）
========================= */

async function incrementUsage(user_id, delta = 1) {
  if (!hasSupabase || !user_id) return null;

  try {
    const { data, error } =
      await supabase
        .from("user_usage")
        .select("output_count")
        .eq("user_id", user_id)
        .maybeSingle();

    if (error) throw error;

    const current =
      data?.output_count ?? 0;

    const next =
      current + Math.max(delta, 0);

    const { error: upErr } =
      await supabase
        .from("user_usage")
        .upsert({
          user_id,
          output_count: next,
          updated_at: new Date().toISOString()
        });

    if (upErr) throw upErr;

    return next;
  } catch (e) {
    console.warn(
      "[supabase] incrementUsage failed:",
      e?.message || e
    );

    return null;
  }
}

/* === ★ 課金ユーティリティ（後払い消費：失敗時は絶対に減らさない） === */

const FREE_QUOTA = 500;

async function getUsageRow(user_id) {
  if (!hasSupabase || !user_id) {
    return {
      output_count: 0,
      paid_credits: 0
    };
  }

  const { data, error } =
    await supabase
      .from("user_usage")
      .select("output_count, paid_credits")
      .eq("user_id", user_id)
      .maybeSingle();

  if (error) throw error;

  return data || {
    output_count: 0,
    paid_credits: 0
  };
}

async function setUsageRow(
  user_id,
  { output_count, paid_credits }
) {
  if (!hasSupabase || !user_id) return;

  const { error } =
    await supabase
      .from("user_usage")
      .upsert({
        user_id,
        output_count,
        paid_credits,
        updated_at: new Date().toISOString()
      });

  if (error) throw error;
}

/** 生成前：残高チェックのみ（消費しない） */

async function checkCredit(user_id) {
  if (!hasSupabase || !user_id) {
    return {
      ok: true,
      row: null
    };
  }

  const row =
    await getUsageRow(user_id);

  const used =
    row.output_count ?? 0;

  const paid =
    row.paid_credits ?? 0;

  return {
    ok:
      used < FREE_QUOTA ||
      paid > 0,
    row
  };
}

/**
 * 生成成功後：ここで初めて消費（無料→有料の順）
 *
 * エラーが起きても絶対に throw せず、
 * クレジット減少が原因でレスポンスが失敗しないようにする
 */

async function consumeAfterSuccess(user_id) {
  if (!hasSupabase || !user_id) {
    return {
      consumed: null
    };
  }

  try {
    const row =
      await getUsageRow(user_id);

    const used =
      row.output_count ?? 0;

    const paid =
      row.paid_credits ?? 0;

    if (used < FREE_QUOTA) {
      await setUsageRow(user_id, {
        output_count: used + 1,
        paid_credits: paid
      });

      return {
        consumed: "free"
      };
    }

    if (paid > 0) {
      await setUsageRow(user_id, {
        output_count: used + 1,
        paid_credits: paid - 1
      });

      return {
        consumed: "paid"
      };
    }

    return {
      consumed: null
    };
  } catch (e) {
    // ここでエラーになっても「生成自体は成功している」のに
    // 500を返さないようにする。

    console.warn(
      "[supabase] consumeAfterSuccess failed, credits NOT decremented:",
      e?.message || e
    );

    return {
      consumed: null,
      error: e?.message || String(e)
    };
  }
}

/* === ★ 追加：購入反映ユーティリティ（credit_100 のみ 100 回付与） === */

const ALLOWED_PRODUCT_ID =
  "credit_100";

const CREDIT_100_AMOUNT = 100;

async function addCreditsForPurchase(
  user_id,
  product_id
) {
  if (!hasSupabase || !user_id) {
    throw new Error(
      "Supabase not configured or user_id missing"
    );
  }

  if (product_id !== ALLOWED_PRODUCT_ID) {
    const err =
      new Error("Unsupported product_id");

    err.status = 400;

    throw err;
  }

  const row =
    await getUsageRow(user_id);

  const paid =
    row.paid_credits ?? 0;

  const nextPaid =
    paid + CREDIT_100_AMOUNT;

  await setUsageRow(user_id, {
    output_count:
      row.output_count ?? 0,
    paid_credits: nextPaid
  });

  return nextPaid;
}

/* =========================
1. 技法 定義テーブル（削除せず維持）
========================= */

const BOKE_DEFS = {
  IIMACHIGAI:
    "言い間違い／聞き間違い：音韻のズレで意外性を生むボケ。",

  HIYU:
    "比喩ボケ：比喩で誇張してのボケ",

  GYAKUSETSU:
    "逆説ボケ：一見正論に聞こえるが論理が破綻しているボケ。",

  GIJI_RONRI:
    "擬似論理ボケ：論理風だが中身がズレているボケ。",

  TSUKKOMI_BOKE:
    "ツッコミの発言が次のボケの伏線になるボケ。",

  RENSA:
    "ボケの連鎖：ボケが次のボケを誘発するように連続させ、加速感を生むボケ。",

  KOTOBA_ASOBI:
    "言葉遊び：ダジャレ・韻などで言語的にふざける。"
};

const TSUKKOMI_DEFS = {
  ODOROKI_GIMON:
    "驚き・疑問ツッコミ：観客の代弁として即時の驚き・疑問でのツッコミ。",

  AKIRE_REISEI:
    "呆れ・冷静ツッコミ：感情を抑えた冷静な態度でのツッコミ。",

  OKORI:
    "怒りツッコミ：怒ったような言い方でのツッコミ。",

  KYOKAN:
    "共感ツッコミ：相手の感情に一度共感してから、ツッコミをする。",

  META:
    "メタツッコミ：漫才の形式・構造そのものを指摘するツッコミ。"
};

const GENERAL_DEFS = {
  SANDAN_OCHI:
    "三段オチ：1・2をフリ、3で意外なオチ。",

  GYAKUHARI:
    "逆張り構成：期待・常識を外して予想を逆手に取る。",

  TENKAI_HAKAI:
    "展開破壊：築いた流れを意図的に壊し異質な要素を挿入。",

  KANCHIGAI_TEISEI:
    "勘違い→訂正：ボケの勘違いをツッコミが訂正する構成。",

  SURECHIGAI:
    "すれ違い：互いの前提が噛み合わずズレ続けて笑いを生む。",

  TACHIBA_GYAKUTEN:
    "立場逆転：途中または終盤で役割・地位がひっくり返る。"
};

/* =========================
2) 旧仕様：ランダム技法（維持）
========================= */

const MUST_HAVE_TECH =
  "比喩ツッコミ";

function pickTechniquesWithMetaphor() {
  const pool = [
    "風刺",
    "皮肉",
    "意外性と納得感",
    "勘違い→訂正",
    "言い間違い→すれ違い",
    "立場逆転",
    "具体例の誇張"
  ];

  const shuffled =
    [...pool].sort(
      () => Math.random() - 0.5
    );

  const extraCount =
    Math.floor(Math.random() * 3) + 1;

  return [
    MUST_HAVE_TECH,
    ...shuffled.slice(0, extraCount)
  ];
}

/* =========================
3) 文字数の最終調整
========================= */

function enforceCharLimit(
  text,
  minLen,
  maxLen,
  allowOverflow = false
) {
  if (!text) return "";

  let t =
    text
      .trim()
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^#{1,6}\s.*$/gm, "")
      .trim();

  if (
    !allowOverflow &&
    t.length > maxLen
  ) {
    const softCut =
      t.lastIndexOf("\n", maxLen);

    const softPuncs = [
      "。",
      "！",
      "？",
      "…",
      "♪"
    ];

    const softPuncCut =
      Math.max(
        ...softPuncs.map(
          (p) => t.lastIndexOf(p, maxLen)
        )
      );

    let cutPos =
      Math.max(
        softPuncCut,
        softCut
      );

    if (cutPos < maxLen * 0.9) {
      cutPos = maxLen;
    }

    t =
      t.slice(0, cutPos).trim();

    if (!/[。！？…♪]$/.test(t)) {
      t += "。";
    }
  }

  if (
    t.length < minLen &&
    !/[。！？…♪]$/.test(t)
  ) {
    t += "。";
  }

  return t;
}

/* =========================
3.5) 最終行の強制付与（修正：重複防止を強化）
========================= */

function ensureTsukkomiOutro(
  text,
  tsukkomiName = "B"
) {
  const outro =
    `${tsukkomiName}: もういいよ！`;

  if (!text) return outro;

  let t = text.trim();

  // 文末にすでに「もういいよ（！）」がある場合、
  // AIが書いたものとシステムが付与するものが
  // 重複しないよう、末尾の「もういいよ」系を削除する。

  const endPattern =
    /(?:^|\n)(?:[^:\n]+:\s*)?もういいよ[！!]*\s*$/;

  while (endPattern.test(t)) {
    t =
      t.replace(
        endPattern,
        ""
      ).trim();
  }

  return t + "\n" + outro;
}

/* 行頭の「名前：/名前:」を「名前: 」に正規化 */

function normalizeSpeakerColons(s) {
  return s.replace(
    /(^|\n)([^\n:：]+)[：:]\s*/g,
    (_m, head, name) =>
      `${head}${name}: `
  );
}

/* 台詞間を1行空ける（重複空行は圧縮） */

function ensureBlankLineBetweenTurns(text) {
  const lines =
    text.split("\n");

  const compressed = [];

  for (const ln of lines) {
    if (
      ln.trim() === "" &&
      compressed.length &&
      compressed[
        compressed.length - 1
      ].trim() === ""
    ) {
      continue;
    }

    compressed.push(ln);
  }

  const out = [];

  for (
    let i = 0;
    i < compressed.length;
    i++
  ) {
    const cur =
      compressed[i];

    out.push(cur);

    const isTurn =
      /^[^:\n：]+:\s/.test(
        cur.trim()
      );

    const next =
      compressed[i + 1];

    const nextIsTurn =
      next != null &&
      /^[^:\n：]+:\s/.test(
        next?.trim() || ""
      );

    if (
      isTurn &&
      nextIsTurn
    ) {
      if (
        cur.trim() !== "" &&
        (next || "").trim() !== ""
      ) {
        out.push("");
      }
    }
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/* =========================
3.6) タイトル/本文の分割
========================= */

function splitTitleAndBody(s) {
  if (!s) {
    return {
      title: "",
      body: ""
    };
  }

  const parts =
    s.split(/\r?\n\r?\n/, 2);

  const rawTitle =
    (parts[0] || "").trim();

  // 先頭の「【」と最初の「】」を削除
  const title =
    rawTitle
      .replace(/^【/, "")
      .replace(/】/, "");

  const body =
    (parts[1] ?? s).trim();

  return {
    title,
    body
  };
}

/* === ★ 3.7) 「タイトルは必ず1つだけ」化
本文先頭の重複タイトル除去 & 必要なら抽出
=== */

function normalizeTitleString(
  str = ""
) {
  return String(str)
    .trim()
    .replace(/^【/, "")
    .replace(/】/, "")
    .replace(
      /^(タイトル|Title)\s*[:：】]?\s*/i,
      ""
    )
    .replace(
      /^#{1,6}\s*/,
      ""
    )
    .replace(/\s+/g, " ");
}

function ensureSingleTitle(
  titleIn,
  bodyIn
) {
  let title =
    normalizeTitleString(
      titleIn || ""
    );

  let body =
    (bodyIn || "")
      .replace(/\r\n/g, "\n");

  let lines =
    body.split("\n");

  while (
    lines.length &&
    lines[0].trim() === ""
  ) {
    lines.shift();
  }

  // 既存タイトルが無い場合、
  // 本文先頭が見出しならタイトルとして抽出
  if (
    !title &&
    lines.length
  ) {
    const first =
      lines[0].trim();

    if (
      first.startsWith("#") ||
      /^【.+】$/.test(first) ||
      /^(タイトル|Title)\s*[:：]/i.test(
        first
      )
    ) {
      title =
        normalizeTitleString(first);

      lines.shift();

      while (
        lines.length &&
        lines[0].trim() === ""
      ) {
        lines.shift();
      }
    }
  }

  // 既存タイトルがある場合、
  // 本文先頭の同義タイトル行を除去
  if (
    title &&
    lines.length
  ) {
    const normTitle =
      normalizeTitleString(title);

    const first =
      lines[0].trim();

    const firstNorm =
      normalizeTitleString(first);

    if (
      first.startsWith("#") ||
      /^【.+】$/.test(first) ||
      /^(タイトル|Title)\s*[:：]/i.test(
        first
      ) ||
      firstNorm.toLowerCase() ===
        normTitle.toLowerCase()
    ) {
      lines.shift();

      while (
        lines.length &&
        lines[0].trim() === ""
      ) {
        lines.shift();
      }

      title = normTitle;
    }
  }

  return {
    title:
      title || "（タイトル未設定）",
    body: lines.join("\n")
  };
}

/* =========================
4) ガイドライン生成
========================= */

function buildGuidelineFromSelections({
  boke = [],
  tsukkomi = [],
  general = []
}) {
  const bokeLines =
    boke
      .filter((k) => BOKE_DEFS[k])
      .map(
        (k) =>
          `- ${BOKE_DEFS[k]}`
      );

  const tsukkomiLines =
    tsukkomi
      .filter((k) => TSUKKOMI_DEFS[k])
      .map(
        (k) =>
          `- ${TSUKKOMI_DEFS[k]}`
      );

  const generalLines =
    general
      .filter((k) => GENERAL_DEFS[k])
      .map(
        (k) =>
          `- ${GENERAL_DEFS[k]}`
      );

  const parts = [];

  if (bokeLines.length) {
    parts.push(
      "【ボケ技法】",
      ...bokeLines
    );
  }

  if (tsukkomiLines.length) {
    parts.push(
      "【ツッコミ技法】",
      ...tsukkomiLines
    );
  }

  if (generalLines.length) {
    parts.push(
      "【全般の構成技法】",
      ...generalLines
    );
  }

  return parts.join("\n");
}

/* =========================
5) プロンプト生成
========================= */

function labelizeSelected({
  boke = [],
  tsukkomi = [],
  general = []
}) {
  const toLabel =
    (ids, table) =>
      ids
        .filter((k) => table[k])
        .map((k) =>
          table[k].split("」")[0]
        )
        .map((s) =>
          s.replace(/^.*?：?/, "")
        );

  return {
    boke: toLabel(
      boke,
      BOKE_DEFS
    ),

    tsukkomi: toLabel(
      tsukkomi,
      TSUKKOMI_DEFS
    ),

    general: toLabel(
      general,
      GENERAL_DEFS
    )
  };
}
/* =========================
5.5) 本文の自己検証＆自動修正パス
（不足技法があれば追記/修正）
========================= */

async function generateContinuation({
  client,
  model,
  baseBody,
  remainingChars,
  tsukkomiName
}) {
  let seed =
    baseBody
      .replace(
        new RegExp(
          `${tsukkomiName}: もういいよ！\\s*$`
        ),
        ""
      )
      .trim();

  const contPrompt = [
    "以下は途中まで書かれた漫才の本文です。これを“そのまま続けてください”。",

    "・タイトルは出さない",

    "・これまでの台詞やネタの反復はしない",

    `・少なくとも ${remainingChars} 文字以上、自然に展開し、最後は ${tsukkomiName}: もういいよ！ で締める`,

    "・各行は「名前: セリフ」の形式（半角コロン＋スペース）",

    "・台詞同士の間には必ず空行を1つ挟む",

    "・自己検証時は《TAG:要素名》の一時タグ法を内部で使って良いが、出力直前に必ず全削除すること（タグを残さない）",

    "",

    // ▼▼▼ 最終チェックリスト ▼▼▼

    "■最終出力前に必ずこのチェックリストを頭の中で確認：",

    "- これまでの文脈にある『題材』から逸れずに展開しているか？",

    "- すべての「採用する技法」を1回以上使ったか？",

    "- 「意外性」があるが「納得感」のある笑える表現を使っているか？",

    "- フリ（導入）→ 伏線回収 → 最後は明確な「オチ」という全体の構成になっているか？",

    "- 途中で展開破壊はあれど、全体として「一貫した話の漫才」となっているか？",

    "- 表現により「緊張感」がある状態とそれが「緩和」する状態があるか？",

    `- 文字数は ${remainingChars}文字以上を目安に自然に展開すること。`,

    "- 各台詞は「名前: セリフ」形式か？",

    `- 最後は ${tsukkomiName}: もういいよ！ の行で終わっており、この行が本文中で1回だけになっているか？`,

    "- タイトルと本文の間には空行があるか？",

    "- 現実的なネタにしているか？",

    // ★具体性
    "- 【超重要】「固有名詞」や「具体的な数字」を必ず使うこと。「美味しい店」ではなく「サイゼリヤ」、「高い」ではなく「35年ローン」など、映像が浮かぶ具体的な言葉選びをすること。",

    "- 抽象的な表現（あれ、それ、あること、面白いこと）は禁止。",

    // ★性格
    "- 各キャラクターは、設定された「性格」に基づいた口調・思考回路を徹底すること。",

    "- 性格の不一致から生まれる「話の通じなさ」を笑いにすること。",

    "→ 1つでもNoなら、即座に修正してから出力。",

    "",

    "【これまでの本文】",

    seed

  ].join("\n");


  const messages = [

    {
      role: "system",

      content:
        "あなたは実力派の漫才師コンビです。本文の“続き”だけを出力してください。"
    },

    {
      role: "user",

      content:
        contPrompt
    }

  ];


  const approxTok =
    Math.min(
      8192,
      Math.ceil(
        Math.max(
          remainingChars * 2,
          400
        ) * 3
      )
    );


  /*
   * GPT-6 Astra対応
   *
   * temperature は送信しない。
   */
  const resp =
    await client.chat.completions.create({

      model,

      messages,

      max_output_tokens:
        approxTok

    });


  let cont =
    resp
      ?.choices?.[0]
      ?.message
      ?.content
      ?.trim() || "";


  cont =
    normalizeSpeakerColons(
      cont
    );


  cont =
    ensureBlankLineBetweenTurns(
      cont
    );


  cont =
    ensureTsukkomiOutro(
      cont,
      tsukkomiName
    );


  return (
    seed +
    "\n" +
    cont
  ).trim();
}


/* =========================
6) OpenAI GPT-6 Astra
   Responses API ラッパー
========================= */

/*
 * OpenAI APIキーはVercelの環境変数から取得。
 *
 * Android / iPhone側にはAPIキーを入れない。
 */

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "";


/*
 * VercelのOPENAI_MODELが設定されていれば
 * それを優先。
 *
 * 未設定の場合はGPT-6 Astraを使用。
 */

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ||
  "gpt-6-astra";


/*
 * OpenAIクライアント
 */

const openai =
  OPENAI_API_KEY
    ? new OpenAI({
        apiKey:
          OPENAI_API_KEY
      })
    : null;


/*
 * 既存コードとの互換性を維持するため、
 *
 * client.chat.completions.create(...)
 *
 * の形式を残しつつ、
 * 内部ではResponses APIを使用する。
 */

const client = {

  chat: {

    completions: {

      async create(payload) {

        if (!openai) {

          const err =
            new Error(
              "OPENAI_API_KEY is not set"
            );

          err.status = 500;

          throw err;
        }


        const model =
          payload.model ||
          OPENAI_MODEL;


        const messages =
          Array.isArray(
            payload.messages
          )
            ? payload.messages
            : [];


        /*
         * Chat Completions形式の
         * messagesをResponses APIの
         * input形式へ変換。
         */

        const input =
          messages.map(
            (m) => ({

              role:
                m.role === "assistant"
                  ? "assistant"
                  : m.role === "system"
                    ? "system"
                    : "user",

              content:
                String(
                  m.content ?? ""
                )

            })
          );


        const maxOutputTokens =
          payload.max_output_tokens ;


        const request = {

          model,

          input,

          ...(maxOutputTokens
            ? {
                max_output_tokens:
                  maxOutputTokens
              }
            : {})

        };


        /*
         * 重要：
         *
         * GPT-6 Astraでは
         * temperatureを送信しない。
         */

        const response =
          await openai.responses.create(
            request
          );


        /*
         * 既存コードが
         *
         * response.choices[0]
         *
         * を読む仕様なので、
         * 互換形式に変換して返す。
         */

        return {

          choices: [

            {

              message: {

                role:
                  "assistant",

                content:
                  response
                    ?.output_text ||
                  ""

              }

            }

          ]

        };

      }

    }

  }

};


/* =========================
失敗理由の整形
========================= */

function normalizeError(err) {

  return {

    name:
      err?.name,

    message:
      err?.message,

    status:
      err?.status ??
      err?.response?.status,

    data:
      err?.response?.data ??
      err?.error,

    stack:
      process.env.NODE_ENV ===
      "production"
        ? undefined
        : err?.stack

  };

}
  const checklist = [
    "■最終出力前に必ずこのチェックリストを頭の中で確認：",

    `- 指定された題材「${theme}」が、漫才全体の中心テーマになっているか？（単語が出るだけでなく、内容そのものが${theme}の話になっているか？ 別の話題にすり替わっていないか？ 逸れている場合は全文書き直してでも${theme}に戻すこと）`,

    `- 指定されたジャンル「${genre}」に沿っているか？`,

    `- 指定された登場人物「${charDesc}」の性格設定を守っているか？`,

    `- すべての「採用する技法」を1回以上使ったか？（採用する技法: ${requiredTechs.join("、") || "（指定なし）"}）`,

    `- フロントで選択された技法（採用する技法）が、ボケとツッコミの掛け合いの中で具体的な台詞・展開として使われているか？`,

    `- 「意外性」があるが「納得感」のある笑える表現を使っているか？`,

    `- ボケやツッコミの表現は、多少ヒヤヒヤしても危険ではなく、最終的に安心感や納得感につながっているか？`,

    `- フリ（導入）→ 伏線回収 → 最後は明確な「オチ」という全体の構成になっているか？`,

    `- 途中で展開破壊はあれど、全体として「一貫した話の漫才」となっているか？`,

    `- 表現により「緊張感」がある状態とそれが「緩和」する状態があるか？`,

    `- 文字数は必ず ${minLen}文字以上 あるか？（不足している場合は加筆修正して伸ばすこと。${minLen}文字未満は許可されない）`,

    `- 各台詞は「名前: セリフ」形式か？`,

    `- 最後は ${tsukkomiName}: もういいよ！ の行で終わっており、この行が本文中で1回だけになっているか？`,

    `- 現実的なネタにしているか？`,

    "- タイトルと本文の間には必ず空行があるか？",

    "- ボケの言葉選びは一般的すぎないか？（もっと具体的な単語に直せないか？）",

    "- ツッコミは単なる「説明」になっていないか？（ボケの異常さを嘆く、呆れる、強く否定する等の「感情」が乗っているか？）",

    "- 台本全体を通して、読み手が『フフッ』と笑えるポイントが3箇以上のポイントがあるか？",

    "- 本文に『皮肉』『風刺』『緊張』『緩和』『伏線』『比喩』という語を一切含めないこと（英字・同義語例: irony, satire, tension, release, foreshadowing, metaphor も不可）。該当語がある場合は別表現に必ず置換してから出力すること。",

    "→ 1つでもNoなら、即座に本文を修正して満たしてから出力。",

    "",

    "※自己検証時は《TAG:要素名》の一時タグ法（例：TAG:伏線回収, TAG:比喩 等）を内部で用いてよいが、出力直前に必ず全削除し、本文にタグを一切残さないこと。"

  ].join("\n");


  const verifyPrompt = [
    "以下の本文を厳密に審査し、基準を1つでも満たさない場合は本文を修正した完全版を出力してください。",

    "満たしている場合は本文をそのまま出力してください。",

    "",

    checklist,

    "",

    "【本文】",

    body

  ].join("\n");


  const messages = [
    {
      role: "system",

      content:
        "あなたは厳格な編集者です。出力は本文のみ（解説・根拠・余計なテキストは禁止）。一時タグは出力に残さないこと。"
    },

    {
      role: "user",

      content: verifyPrompt
    }
  ];


  const approxTok =
    Math.min(
      8192,
      Math.ceil(
        Math.max(maxLen * 2, 2000) * 3
      )
    );


  /*
   * GPT-6 Astraでは temperature を送信しない。
   */

  const resp =
    await client.chat.completions.create({

      model,

      messages,

      max_output_tokens:
        approxTok

    });


  let revised =
    resp?.choices?.[0]?.message?.content?.trim() ||
    body;


  // 仕上げ整形（順序固定）

  revised =
    normalizeSpeakerColons(
      revised
    );

  revised =
    ensureBlankLineBetweenTurns(
      revised
    );

  revised =
    ensureTsukkomiOutro(
      revised,
      tsukkomiName
    );

  revised =
    enforceCharLimit(
      revised,
      minLen,
      maxLen,
      false
    );


  return revised;


/* =========================
★ 5.6) 最終本文からタイトルを再生成
========================= */

async function generateTitleForBody({
  client,
  model,
  body
}) {

  const prompt = [

    "以下の漫才台本の内容にふさわしい、面白くてキャッチーな「タイトル」を1つだけ考えてください。",

    "・出力はタイトルのみ（余計な挨拶や「タイトル：」などの接頭辞は不要）",

    "・20文字以内",

    "",

    "【漫才台本】",

    body

  ].join("\n");


  const messages = [

    {
      role: "system",

      content:
        "あなたは優秀な放送作家です。"
    },

    {
      role: "user",

      content: prompt
    }

  ];


  /*
   * GPT-6 Astraでは temperature を送信しない。
   */

  const resp =
    await client.chat.completions.create({

      model,

      messages,

      max_output_tokens: 100

    });


  let title =
    resp?.choices?.[0]?.message?.content?.trim() ||
    "";


  // 掃除

  title =
    title
      .replace(/^【|】$/g, "")
      .replace(/^タイトル[:：]\s*/, "")
      .replace(/\"/g, "");


  return title;
}
/* =========================
7) HTTP ハンドラ
（後払い消費＋安定出力）
========================= */

export default async function handler(
  req,
  res
) {

  /*
   * Android / iPhone / Webからの
   * APIアクセスに対応
   */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  /*
   * CORS preflight
   */

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  try {

    if (
      req.method !== "POST"
    ) {

      return res
        .status(405)
        .json({
          error:
            "Method Not Allowed"
        });

    }


    /*
     * =========================
     * 購入反映モード
     * =========================
     *
     * credit_100 のみ
     * 100クレジット付与
     */

    if (
      req.body?.action ===
      "add_credit"
    ) {

      try {

        const {
          user_id,
          product_id
        } = req.body || {};


        if (!user_id) {

          return res
            .status(400)
            .json({
              error:
                "user_id required"
            });

        }


        const nextPaid =
          await addCreditsForPurchase(
            user_id,
            product_id
          );


        return res
          .status(200)
          .json({

            ok: true,

            paid_credits:
              nextPaid,

            product_id

          });

      } catch (e) {

        const ee =
          normalizeError(e);

        const status =
          ee.status || 500;


        return res
          .status(status)
          .json({

            error:
              "add_credit failed",

            detail:
              ee

          });

      }

    }


    /*
     * =========================
     * 通常の漫才生成
     * =========================
     */

    const {
      theme,
      genre,
      characters,
      length,
      boke,
      tsukkomi,
      general,
      user_id
    } = req.body || {};


    /*
     * 生成前：
     * 残高チェックのみ
     * この時点では消費しない
     */

    const gate =
      await checkCredit(
        user_id
      );


    if (!gate.ok) {

      const row =
        gate.row || {
          output_count: 0,
          paid_credits: 0
        };


      return res
        .status(403)
        .json({

          error:
            `使用上限（${FREE_QUOTA}回）に達しており、クレジットが不足しています。`,

          usage_count:
            row.output_count,

          paid_credits:
            row.paid_credits

        });

    }


    /*
     * =========================
     * プロンプト生成
     * =========================
     */

    const {
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
    } =
      buildPrompt({

        theme,

        genre,

        characters,

        length,

        selected: {

          boke:
            Array.isArray(boke)
              ? boke
              : [],

          tsukkomi:
            Array.isArray(tsukkomi)
              ? tsukkomi
              : [],

          general:
            Array.isArray(general)
              ? general
              : []

        }

      });


    /*
     * =========================
     * GPT-6 Astra 呼び出し
     * =========================
     */

    const approxMaxTok =
      Math.min(
        8192,
        Math.ceil(
          Math.max(
            maxLen * 2,
            3500
          ) * 3
        )
      );


    const messages = [

      {
        role: "system",

        content:
          "あなたは実力派の漫才師コンビです。舞台で即使える台本だけを出力してください。解説・メタ記述は禁止。"
      },

      {
        role: "user",

        content:
          prompt

      }

    ];


    /*
     * ★変更点
     *
     * DEFAULT_MODEL
     * →
     * OPENAI_MODEL
     *
     * temperature は削除
     */

    const payload = {

      model:
        OPENAI_MODEL,

      messages,

      max_output_tokens:
        approxMaxTok

    };


    let completion;


    try {

      completion =
        await client
          .chat
          .completions
          .create(
            payload
          );

    } catch (err) {

      const e =
        normalizeError(err);


      console.error(
        "[openai error]",
        e
      );


      /*
       * API失敗時は
       * クレジットを消費しない
       */

      return res
        .status(
          e.status || 500
        )
        .json({

          error:
            "OpenAI request failed",

          detail:
            e

        });

    }
    /* =========================
本文の整形後処理
========================= */

    body =
      normalizeSpeakerColons(
        body
      );

    body =
      ensureBlankLineBetweenTurns(
        body
      );

    body =
      ensureTsukkomiOutro(
        body,
        tsukkomiName
      );


    /* =========================
    指定文字数との差を補う
    ========================= */

    const deficit =
      targetLen -
      body.length;


    if (deficit >= 30) {

      try {

        body =
          await generateContinuation({

            client,

            /*
             * ★ GPT-6 Astraを使用
             */
            model:
              OPENAI_MODEL,

            baseBody:
              body,

            remainingChars:
              deficit,

            tsukkomiName

          });


        /*
         * 追記後も同じ順序で仕上げる
         */

        body =
          normalizeSpeakerColons(
            body
          );

        body =
          ensureBlankLineBetweenTurns(
            body
          );

        body =
          ensureTsukkomiOutro(
            body,
            tsukkomiName
          );


      } catch (e) {

        console.warn(
          "[continuation] failed:",
          e?.message || e
        );

      }

    }


    /* =========================
    自己検証＆自動修正
    （採用する技法の担保）
    ========================= */

    const requiredForCheck =
      Array.isArray(
        techniquesForMeta
      )
        ? techniquesForMeta
        : [];


    try {

      body =
        await selfVerifyAndCorrectBody({

          client,

          /*
           * ★ GPT-6 Astra
           */
          model:
            OPENAI_MODEL,

          body,

          requiredTechs:
            requiredForCheck,

          minLen,

          maxLen,

          tsukkomiName,

          theme:
            safeTheme,

          genre:
            safeGenre,

          charDesc

        });


    } catch (e) {

      console.warn(
        "[self-verify] failed:",
        e?.message || e
      );

      /*
       * 検証が失敗しても致命的にはしない。
       * 本文は現状のまま続行。
       */

    }


    /* =========================
    最終レンジ調整
    ========================= */

    body =
      enforceCharLimit(
        body,
        minLen,
        maxLen,
        false
      );


    /* =========================
    タイトル再生成
    本文確定後に内容と整合させる
    ========================= */

    if (
      typeof body === "string" &&
      body.trim().length > 0
    ) {

      try {

        const newTitle =
          await generateTitleForBody({

            client,

            /*
             * ★ GPT-6 Astra
             */
            model:
              OPENAI_MODEL,

            body

          });


        if (
          newTitle &&
          newTitle.length > 0
        ) {

          title =
            newTitle;

        }


      } catch (e) {

        console.warn(
          "[title-gen] failed:",
          e?.message || e
        );

      }

    }


    /* =========================
    成功判定
    本文非空のみ
    ========================= */

    const success =
      typeof body === "string" &&
      body.trim().length > 0;


    if (!success) {

      /*
       * 失敗：
       * クレジットは消費しない
       */

      return res
        .status(500)
        .json({
          error:
            "Empty output"
        });

    }


    /* =========================
    成功：
    ここで初めてクレジット消費
    ========================= */

    await consumeAfterSuccess(
      user_id
    );


    /* =========================
    残量取得
    ========================= */

    let metaUsage = null;

    let metaCredits = null;


    if (
      hasSupabase &&
      user_id
    ) {

      try {

        const row =
          await getUsageRow(
            user_id
          );


        metaUsage =
          row.output_count ??
          null;


        metaCredits =
          row.paid_credits ??
          null;


      } catch (e) {

        console.warn(
          "[supabase] fetch after consume failed:",
          e?.message || e
        );

      }

    }


    /* =========================
    iPhone / Swift の
    JSONDecoder対策
    ========================= */

    /*
     * AIが生成した文字列に混入する可能性がある
     * 特殊Unicode（行区切り文字など）、
     * 不正なサロゲートペア、
     * 制御文字（C0、C1、BOM等）を
     * 除去・正規化する。
     *
     * iOS / Swift の JSONDecoder での
     * パースクラッシュやデコードエラーを防止。
     */

    const sanitizeStringForSwift =
      (str) => {

        if (
          typeof str !==
          "string"
        ) {
          return "";
        }


        let s =
          str

            /*
             * Unicodeの行区切り文字を
             * 通常の改行へ
             */

            .replace(
              /[\u2028\u2029]/g,
              "\n"
            )

            /*
             * C0/C1制御文字、
             * BOM等を削除
             */

            .replace(
              /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFEFF]/g,
              ""
            );


        /*
         * toWellFormed() が利用できる
         * Node.js環境ではこちらを使用。
         */

        if (
          typeof s.toWellFormed ===
          "function"
        ) {

          s =
            s.toWellFormed();


        } else {

          /*
           * 古い環境向けフォールバック
           */

          s =
            s.replace(
              /[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g,

              (m) =>
                m.length > 1
                  ? m
                  : "\ufffd"
            );

        }


        return s;

      };


    /* =========================
    各レスポンス値をサニタイズ
    ========================= */

    const sanitizedBody =
      sanitizeStringForSwift(
        body
      );


    const sanitizedTitle =
      sanitizeStringForSwift(
        title
      );


    const sanitizedStructure =
      Array.isArray(
        structureMeta
      )
        ? structureMeta.map(
            sanitizeStringForSwift
          )
        : [];


    const sanitizedTechniques =
      Array.isArray(
        techniquesForMeta
      )
        ? techniquesForMeta.map(
            sanitizeStringForSwift
          )
        : [];


    /* =========================
    UTF-8 JSON
    ========================= */

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );


    /* =========================
    Android / iPhone共通レスポンス
    ========================= */

    return res
      .status(200)
      .json({

        /*
         * iPhone
         */

        title:
          sanitizedTitle ||
          "（タイトル未設定）",


        /*
         * iPhone / Android
         */

        body:
          sanitizedBody ||
          "（ネタの生成に失敗しました）",


        /*
         * Android旧版などとの互換
         */

        text:
          sanitizedBody ||
          "（ネタの生成に失敗しました）",


        /*
         * 念のためcontentも返す
         */

        content:
          sanitizedBody ||
          "（ネタの生成に失敗しました）",


        /* =========================
        メタデータ
        ========================= */

        meta: {

          structure:
            sanitizedStructure,


          techniques:
            sanitizedTechniques,


          usage_count:
            metaUsage
              ? Math.floor(
                  metaUsage
                )
              : 0,


          paid_credits:
            metaCredits
              ? Math.floor(
                  metaCredits
                )
              : 0,


          target_length:
            targetLen
              ? Math.floor(
                  targetLen
                )
              : 0,


          min_length:
            minLen
              ? Math.floor(
                  minLen
                )
              : 0,


          max_length:
            maxLen
              ? Math.floor(
                  maxLen
                )
              : 0,


          actual_length:
            sanitizedBody.length

        }

      });


  } catch (err) {

    const e =
      normalizeError(
        err
      );


    console.error(
      "[handler error]",
      e
    );


    /*
     * 失敗：
     * もちろんクレジットは消費しない
     */

    return res
      .status(500)
      .json({

        error:
          "Server Error",

        detail:
          e

      });

  }

}