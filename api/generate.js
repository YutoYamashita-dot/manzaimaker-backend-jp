javascript
export const config = { runtime: "nodejs" };

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "";

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const hasSupabase =
  !!(SUPABASE_URL && SUPABASE_KEY);

const supabase =
  hasSupabase
    ? createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      )
    : null;


/* =========================
Supabase / Credit
========================= */

async function incrementUsage(
  user_id,
  delta = 1
) {
  if (!hasSupabase || !user_id) {
    return null;
  }

  try {
    const { data, error } =
      await supabase
        .from("user_usage")
        .select("output_count")
        .eq("user_id", user_id)
        .maybeSingle();

    if (error) {
      throw error;
    }

    const current =
      data?.output_count ?? 0;

    const next =
      current +
      Math.max(delta, 0);

    const { error: upErr } =
      await supabase
        .from("user_usage")
        .upsert({
          user_id,
          output_count: next,
          updated_at:
            new Date().toISOString()
        });

    if (upErr) {
      throw upErr;
    }

    return next;

  } catch (e) {

    console.warn(
      "[supabase] incrementUsage failed:",
      e?.message || e
    );

    return null;
  }
}


const FREE_QUOTA = 500;


async function getUsageRow(user_id) {

  if (
    !hasSupabase ||
    !user_id
  ) {
    return {
      output_count: 0,
      paid_credits: 0
    };
  }

  const { data, error } =
    await supabase
      .from("user_usage")
      .select(
        "output_count, paid_credits"
      )
      .eq("user_id", user_id)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return (
    data || {
      output_count: 0,
      paid_credits: 0
    }
  );
}


async function setUsageRow(
  user_id,
  {
    output_count,
    paid_credits
  }
) {

  if (
    !hasSupabase ||
    !user_id
  ) {
    return;
  }

  const { error } =
    await supabase
      .from("user_usage")
      .upsert({
        user_id,
        output_count,
        paid_credits,
        updated_at:
          new Date().toISOString()
      });

  if (error) {
    throw error;
  }
}


async function checkCredit(
  user_id
) {

  if (
    !hasSupabase ||
    !user_id
  ) {
    return {
      ok: true,
      row: null
    };
  }

  const row =
    await getUsageRow(
      user_id
    );

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


async function consumeAfterSuccess(
  user_id
) {

  if (
    !hasSupabase ||
    !user_id
  ) {
    return {
      consumed: null
    };
  }

  try {

    const row =
      await getUsageRow(
        user_id
      );

    const used =
      row.output_count ?? 0;

    const paid =
      row.paid_credits ?? 0;


    if (
      used < FREE_QUOTA
    ) {

      await setUsageRow(
        user_id,
        {
          output_count:
            used + 1,

          paid_credits:
            paid
        }
      );

      return {
        consumed:
          "free"
      };
    }


    if (paid > 0) {

      await setUsageRow(
        user_id,
        {
          output_count:
            used + 1,

          paid_credits:
            paid - 1
        }
      );

      return {
        consumed:
          "paid"
      };
    }


    return {
      consumed: null
    };

  } catch (e) {

    console.warn(
      "[supabase] consumeAfterSuccess failed, credits NOT decremented:",
      e?.message || e
    );

    return {
      consumed: null,
      error:
        e?.message ||
        String(e)
    };
  }
}


const ALLOWED_PRODUCT_ID =
  "credit_100";

const CREDIT_100_AMOUNT =
  100;


async function addCreditsForPurchase(
  user_id,
  product_id
) {

  if (
    !hasSupabase ||
    !user_id
  ) {
    throw new Error(
      "Supabase not configured or user_id missing"
    );
  }


  if (
    product_id !==
    ALLOWED_PRODUCT_ID
  ) {

    const err =
      new Error(
        "Unsupported product_id"
      );

    err.status = 400;

    throw err;
  }


  const row =
    await getUsageRow(
      user_id
    );

  const paid =
    row.paid_credits ?? 0;

  const nextPaid =
    paid +
    CREDIT_100_AMOUNT;


  await setUsageRow(
    user_id,
    {
      output_count:
        row.output_count ?? 0,

      paid_credits:
        nextPaid
    }
  );


  return nextPaid;
}


/* =========================
技法定義
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
      () =>
        Math.random() -
        0.5
    );


  const extraCount =
    Math.floor(
      Math.random() * 3
    ) + 1;


  return [
    MUST_HAVE_TECH,
    ...shuffled.slice(
      0,
      extraCount
    )
  ];
}


/* =========================
文字数
========================= */

function enforceCharLimit(
  text,
  minLen,
  maxLen,
  allowOverflow = false
) {

  if (!text) {
    return "";
  }


  let t =
    text
      .trim()
      .replace(
        /```[\s\S]*?```/g,
        ""
      )
      .replace(
        /^#{1,6}\s.*$/gm,
        ""
      )
      .trim();


  if (
    !allowOverflow &&
    t.length > maxLen
  ) {

    const softCut =
      t.lastIndexOf(
        "\n",
        maxLen
      );


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
          (p) =>
            t.lastIndexOf(
              p,
              maxLen
            )
        )
      );


    let cutPos =
      Math.max(
        softPuncCut,
        softCut
      );


    if (
      cutPos <
      maxLen * 0.9
    ) {
      cutPos = maxLen;
    }


    t =
      t
        .slice(
          0,
          cutPos
        )
        .trim();


    if (
      !/[。！？…♪]$/.test(t)
    ) {
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
最後のツッコミ
========================= */

function ensureTsukkomiOutro(
  text,
  tsukkomiName = "B"
) {

  const outro =
    `${tsukkomiName}: もういいよ！`;


  if (!text) {
    return outro;
  }


  let t =
    text.trim();


  const endPattern =
    /(?:^|\n)(?:[^:\n]+:\s*)?もういいよ[！!]*\s*$/;


  while (
    endPattern.test(t)
  ) {

    t =
      t
        .replace(
          endPattern,
          ""
        )
        .trim();
  }


  return (
    t +
    "\n" +
    outro
  );
}


/* =========================
話者表記
========================= */

function normalizeSpeakerColons(
  s
) {

  return s.replace(
    /(^|\n)([^\n:：]+)[：:]\s*/g,
    (
      _m,
      head,
      name
    ) =>
      `${head}${name}: `
  );
}


/* =========================
台詞間の空行
========================= */

function ensureBlankLineBetweenTurns(
  text
) {

  const lines =
    text.split("\n");

  const compressed = [];


  for (
    const ln of lines
  ) {

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
    i <
      compressed.length;
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
    .replace(
      /\n{3,}/g,
      "\n\n"
    );
}


/* =========================
タイトル分離
========================= */

function splitTitleAndBody(
  s
) {

  if (!s) {

    return {
      title: "",
      body: ""
    };
  }


  const parts =
    s.split(
      /\r?\n\r?\n/,
      2
    );


  const rawTitle =
    (
      parts[0] ||
      ""
    ).trim();


  const title =
    rawTitle
      .replace(
        /^【/,
        ""
      )
      .replace(
        /】/,
        "");


  const body =
    (
      parts[1] ??
      s
    ).trim();


  return {
    title,
    body
  };
}


/* =========================
タイトル正規化
========================= */

function normalizeTitleString(
  str = ""
) {

  return String(str)
    .trim()
    .replace(
      /^【/,
      ""
    )
    .replace(
      /】/,
      ""
    )
    .replace(
      /^(タイトル|Title)\s*[:：】]?\s*/i,
      ""
    )
    .replace(
      /^#{1,6}\s*/,
      ""
    )
    .replace(
      /\s+/g,
      " "
    );
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
      .replace(
        /\r\n/g,
        "\n"
      );

  let lines =
    body.split("\n");


  while (
    lines.length &&
    lines[0].trim() === ""
  ) {

    lines.shift();
  }


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
        normalizeTitleString(
          first
        );


      lines.shift();


      while (
        lines.length &&
        lines[0].trim() === ""
      ) {
        lines.shift();
      }
    }
  }


  if (
    title &&
    lines.length
  ) {

    const normTitle =
      normalizeTitleString(
        title
      );


    const first =
      lines[0].trim();


    const firstNorm =
      normalizeTitleString(
        first
      );


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


      title =
        normTitle;
    }
  }


  return {

    title:
      title ||
      "（タイトル未設定）",

    body:
      lines.join("\n")
  };
}


/* =========================
ガイドライン
========================= */

function buildGuidelineFromSelections({
  boke = [],
  tsukkomi = [],
  general = []
}) {

  const bokeLines =
    boke
      .filter(
        (k) =>
          BOKE_DEFS[k]
      )
      .map(
        (k) =>
          `- ${BOKE_DEFS[k]}`
      );


  const tsukkomiLines =
    tsukkomi
      .filter(
        (k) =>
          TSUKKOMI_DEFS[k]
      )
      .map(
        (k) =>
          `- ${TSUKKOMI_DEFS[k]}`
      );


  const generalLines =
    general
      .filter(
        (k) =>
          GENERAL_DEFS[k]
      )
      .map(
        (k) =>
          `- ${GENERAL_DEFS[k]}`
      );


  const parts = [];


  if (
    bokeLines.length
  ) {

    parts.push(
      "【ボケ技法】",
      ...bokeLines
    );
  }


  if (
    tsukkomiLines.length
  ) {

    parts.push(
      "【ツッコミ技法】",
      ...tsukkomiLines
    );
  }


  if (
    generalLines.length
  ) {

    parts.push(
      "【全般の構成技法】",
      ...generalLines
    );
  }


  return parts.join(
    "\n"
  );
}


/* =========================
技法ラベル
========================= */

function labelizeSelected({
  boke = [],
  tsukkomi = [],
  general = []
}) {

  const toLabel =
    (
      ids,
      table
    ) =>
      ids
        .filter(
          (k) =>
            table[k]
        )
        .map(
          (k) =>
            table[k].split(
              "」"
            )[0]
        )
        .map(
          (s) =>
            s.replace(
              /^.*?：?/,
              ""
            )
        );


  return {

    boke:
      toLabel(
        boke,
        BOKE_DEFS
      ),

    tsukkomi:
      toLabel(
        tsukkomi,
        TSUKKOMI_DEFS
      ),

    general:
      toLabel(
        general,
        GENERAL_DEFS
      )
  };
}

javascript
/* =========================
プロンプト
========================= */

function buildPrompt({
  theme = "",
  genre = "",
  characters = "",
  length = 1000,
  selected = {}
}) {

  const boke =
    Array.isArray(
      selected.boke
    )
      ? selected.boke
      : [];


  const tsukkomi =
    Array.isArray(
      selected.tsukkomi
    )
      ? selected.tsukkomi
      : [];


  const general =
    Array.isArray(
      selected.general
    )
      ? selected.general
      : [];


  const selectedLabels =
    labelizeSelected({
      boke,
      tsukkomi,
      general
    });


  const guideline =
    buildGuidelineFromSelections({
      boke,
      tsukkomi,
      general
    });


  const techniquesForMeta = [

    ...selectedLabels.boke,

    ...selectedLabels.tsukkomi,

    ...selectedLabels.general

  ];


  const structureMeta =
    [
      ...selectedLabels.general
    ];


  const safeTheme =
    String(
      theme || ""
    ).trim() ||
    "日常生活";


  const safeGenre =
    String(
      genre || ""
    ).trim() ||
    "漫才";


  const charDesc =
    typeof characters ===
      "string"

      ? characters.trim()

      : JSON.stringify(
          characters ??
          ""
        );


  const targetLen =
    Number.isFinite(
      Number(length)
    ) &&
    Number(length) > 0

      ? Math.floor(
          Number(length)
        )

      : 1000;


  const minLen =
    Math.max(
      1,
      Math.floor(
        targetLen * 0.9
      )
    );


  const maxLen =
    Math.max(
      minLen,
      Math.ceil(
        targetLen * 1.1
      )
    );


  const tsukkomiName =
    "B";


  const techniqueText =
    techniquesForMeta.length

      ? techniquesForMeta.join(
          "、"
        )

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

    guideline
      ? "【技法ガイドライン】\n" +
        guideline
      : "",

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

    "- 舞台でそのまま使える自然な掛け合いにする。",

    "",

    "【最終チェック】",

    "- 題材が台本全体の中心になっているか。",

    "- 登場人物の性格と役割が一貫しているか。",

    "- 採用した技法が自然に台詞や展開へ反映されているか。",

    "- 導入→展開→オチが成立しているか。",

    `- 最後の ${tsukkomiName}: もういいよ！ は1回だけ。`

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
続き生成
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
          `${tsukkomiName}: もういいよ!\\s*$`
        ),
        ""
      )
      .trim();


  const contPrompt = [

    "以下は途中まで書かれた漫才の本文です。これをそのまま続けてください。",

    "・タイトルは出さない",

    "・これまでの台詞やネタの反復はしない",

    `・少なくとも ${remainingChars} 文字以上、自然に展開し、最後は ${tsukkomiName}: もういいよ！ で締める`,

    "・各行は「名前: セリフ」の形式（半角コロン＋スペース）",

    "・台詞同士の間には必ず空行を1つ挟む",

    "・一時タグは出力に残さない",

    "",

    "■最終チェック",

    "- 題材から逸れない。",

    "- 採用する技法を自然に使う。",

    "- 意外性と納得感の両方を作る。",

    "- 導入→展開→オチを成立させる。",

    `- 文字数は ${remainingChars}文字以上を目安にする。`,

    "- 各台詞は「名前: セリフ」形式。",

    `- 最後は ${tsukkomiName}: もういいよ！ の行で終える。`,

    "- 固有名詞や具体的な数字を使う。",

    "- 抽象的な表現を避ける。",

    "",

    "【これまでの本文】",

    seed

  ].join("\n");


  const messages = [

    {

      role:
        "system",

      content:
        "あなたは実力派の漫才師コンビです。本文の続きだけを出力してください。"

    },

    {

      role:
        "user",

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


  const resp =
    await client
      .chat
      .completions
      .create({

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
      ?.trim() ||
    "";


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
OpenAI
========================= */

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ||
  "";


const OPENAI_MODEL =
  process.env.OPENAI_MODEL ||
  "gpt-6-astra";


const openai =
  OPENAI_API_KEY

    ? new OpenAI({
        apiKey:
          OPENAI_API_KEY
      })

    : null;


const client = {

  chat: {

    completions: {

      async create(
        payload
      ) {

        if (!openai) {

          const err =
            new Error(
              "OPENAI_API_KEY is not set"
            );

          err.status =
            500;

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


        const input =
          messages.map(
            (m) => ({

              role:
                m.role ===
                "assistant"

                  ? "assistant"

                  : m.role ===
                    "system"

                    ? "system"

                    : "user",

              content:
                String(
                  m.content ??
                  ""
                )

            })
          );


        const maxOutputTokens =
          payload.max_output_tokens;


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


        const response =
          await openai
            .responses
            .create(
              request
            );


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
Error
========================= */

function normalizeError(
  err
) {

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


/* =========================
自己検証
========================= */

async function selfVerifyAndCorrectBody({

  client,

  model,

  body,

  requiredTechs = [],

  minLen,

  maxLen,

  tsukkomiName = "B",

  theme = "",

  genre = "",

  charDesc = ""

}) {

  if (
    !body ||
    !String(body).trim()
  ) {

    return "";
  }


  const checklist = [

    "■最終出力前に必ず確認すること：",

    `- 指定された題材「${theme}」が台本全体の中心になっているか。`,

    `- 指定されたジャンル「${genre}」に沿っているか。`,

    `- 指定された登場人物「${charDesc}」の性格設定を守っているか。`,

    `- 採用する技法をできるだけ具体的な台詞・展開として使っているか。`,

    `- 採用技法: ${requiredTechs.join("、") || "指定なし"}`,

    "- 意外性と納得感の両方があるか。",

    "- 導入→展開→オチの流れが成立しているか。",

    `- 本文は${minLen}〜${maxLen}文字程度か。`,

    "- 各台詞は「名前: セリフ」形式か。",

    `- 最後は ${tsukkomiName}: もういいよ！ で終わっているか。`,

    "- 技法名やメタ解説を本文に書いていないか。"

  ].join("\n");


  const prompt = [

    "以下の漫才台本を厳密に編集してください。",

    "基準を満たしていれば内容をできるだけ維持し、満たしていない部分だけ自然に修正してください。",

    "出力は修正後の本文だけ。タイトル、解説、分析、チェック結果は禁止です。",

    "",

    checklist,

    "",

    "【本文】",

    String(body)

  ].join("\n");


  const resp =
    await client
      .chat
      .completions
      .create({

        model,

        messages: [

          {

            role:
              "system",

            content:
              "あなたは漫才台本の最終編集者です。本文だけを出力してください。"

          },

          {

            role:
              "user",

            content:
              prompt

          }

        ],

        max_output_tokens:
          Math.min(
            8192,
            Math.max(
              2000,
              Math.ceil(
                maxLen * 3
              )
            )
          )

      });


  let revised =
    resp
      ?.choices?.[0]
      ?.message
      ?.content
      ?.trim() ||
    body;


  revised =
    revised
      .replace(
        /^```(?:text|markdown|txt)?\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();


  revised =
    normalizeSpeakerColons(
      revised
    );


  revised =
    ensureBlankLineBetweenTurns(
      revised
    );


  revised =
    enforceCharLimit(
      revised,
      minLen,
      maxLen,
      false
    );


  revised =
    ensureTsukkomiOutro(
      revised,
      tsukkomiName
    );


  return revised.trim();
}

javascript
/* =========================
メイン handler
========================= */

export default async function handler(
  req,
  res
) {

  if (
    req.method !==
    "POST"
  ) {

    return res
      .status(405)
      .json({
        error:
          "Method Not Allowed"
      });
  }


  try {

    const body =
      req.body || {};


    const action =
      body.action ||
      "generate";


    /* =========================
    購入クレジット追加
    ========================= */

    if (
      action ===
      "add_credits"
    ) {

      const user_id =
        String(
          body.user_id ||
          ""
        ).trim();


      const product_id =
        String(
          body.product_id ||
          ""
        ).trim();


      if (!user_id) {

        return res
          .status(400)
          .json({
            error:
              "user_id is required"
          });
      }


      if (!product_id) {

        return res
          .status(400)
          .json({
            error:
              "product_id is required"
          });
      }


      const paidCredits =
        await addCreditsForPurchase(
          user_id,
          product_id
        );


      return res
        .status(200)
        .json({

          ok: true,

          user_id,

          product_id,

          paid_credits:
            paidCredits

        });
    }


    /* =========================
    通常生成
    ========================= */

    if (
      action !==
      "generate"
    ) {

      return res
        .status(400)
        .json({
          error:
            "Unknown action"
        });
    }


    const user_id =
      String(
        body.user_id ||
        ""
      ).trim();


    const theme =
      String(
        body.theme ||
        ""
      ).trim();


    const genre =
      String(
        body.genre ||
        ""
      ).trim();


    const characters =
      body.characters ??
      "";


    const length =
      Number(
        body.length ||
        1000
      );


    const selected =
      body.selected ||
      body.techniques ||
      {};


    /* =========================
    クレジット確認
    ========================= */

    const credit =
      await checkCredit(
        user_id
      );


    if (!credit.ok) {

      return res
        .status(402)
        .json({

          error:
            "クレジットが不足しています。",

          code:
            "INSUFFICIENT_CREDITS",

          output_count:
            credit.row
              ?.output_count ??
            0,

          paid_credits:
            credit.row
              ?.paid_credits ??
            0

        });
    }


    /* =========================
    プロンプト作成
    ========================= */

    const promptData =
      buildPrompt({

        theme,

        genre,

        characters,

        length,

        selected

      });


    const {

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

    } =
      promptData;


    /* =========================
    初回生成
    ========================= */

    const response =
      await client
        .chat
        .completions
        .create({

          model:
            OPENAI_MODEL,

          messages: [

            {

              role:
                "system",

              content:
                [
                  "あなたはプロの漫才作家です。",
                  "舞台でそのまま使える、日本語の漫才台本を作成してください。",
                  "説明や分析ではなく、完成した台本だけを出力してください。",
                  "必ず自然な掛け合いと明確なオチを作ってください。"
                ].join("\n")

            },

            {

              role:
                "user",

              content:
                prompt

            }

          ],

          max_output_tokens:
            Math.min(
              8192,
              Math.max(
                2000,
                Math.ceil(
                  targetLen * 3
                )
              )
            )

        });


    let raw =
      response
        ?.choices?.[0]
        ?.message
        ?.content ||
      "";


    raw =
      String(
        raw
      )
      .replace(
        /^```(?:text|markdown|txt)?\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();


    /* =========================
    タイトルと本文を分離
    ========================= */

    let {
      title,
      body: generatedBody
    } =
      splitTitleAndBody(
        raw
      );


    const normalized =
      ensureSingleTitle(
        title,
        generatedBody
      );


    title =
      normalized.title;


    let bodyText =
      normalized.body;


    /* =========================
    話者表記・空行を整形
    ========================= */

    bodyText =
      normalizeSpeakerColons(
        bodyText
      );


    bodyText =
      ensureBlankLineBetweenTurns(
        bodyText
      );


    /* =========================
    最初の「もういいよ！」
    ========================= */

    bodyText =
      ensureTsukkomiOutro(
        bodyText,
        tsukkomiName
      );


    /* =========================
    短すぎる場合は続きを生成
    ========================= */

    if (
      bodyText.length <
      minLen
    ) {

      const remainingChars =
        Math.max(
          minLen -
            bodyText.length,

          Math.ceil(
            minLen * 0.2
          )
        );


      bodyText =
        await generateContinuation({

          client,

          model:
            OPENAI_MODEL,

          baseBody:
            bodyText,

          remainingChars,

          tsukkomiName

        });


      bodyText =
        normalizeSpeakerColons(
          bodyText
        );


      bodyText =
        ensureBlankLineBetweenTurns(
          bodyText
        );


      bodyText =
        ensureTsukkomiOutro(
          bodyText,
          tsukkomiName
        );
    }


    /* =========================
    自己検証・修正
    ========================= */

    bodyText =
      await selfVerifyAndCorrectBody({

        client,

        model:
          OPENAI_MODEL,

        body:
          bodyText,

        requiredTechs:
          techniquesForMeta,

        minLen,

        maxLen,

        tsukkomiName,

        theme:
          safeTheme,

        genre:
          safeGenre,

        charDesc

      });


    /* =========================
    最終整形
    ========================= */

    bodyText =
      normalizeSpeakerColons(
        bodyText
      );


    bodyText =
      ensureBlankLineBetweenTurns(
        bodyText
      );


    bodyText =
      enforceCharLimit(
        bodyText,
        minLen,
        maxLen,
        false
      );


    /*
     * ★★★★★★★★★★★★★★★★★★★★★
     *
     * ここが今回の1か所だけの修正箇所
     *
     * 文字数制限で末尾が切られた場合でも、
     * 最終的に必ず「もういいよ！」を付ける。
     *
     * ★★★★★★★★★★★★★★★★★★★★★
     */

    bodyText =
      ensureTsukkomiOutro(
        bodyText,
        tsukkomiName
      );


    /* =========================
    タイトル再生成
    ========================= */

    if (
      !title ||
      title ===
        "（タイトル未設定）"
    ) {

      try {

        const titleResponse =
          await client
            .chat
            .completions
            .create({

              model:
                OPENAI_MODEL,

              messages: [

                {

                  role:
                    "system",

                  content:
                    "あなたは漫才のタイトルを考える専門家です。タイトルだけを出力してください。"

                },

                {

                  role:
                    "user",

                  content:
                    [
                      `題材: ${safeTheme}`,

                      `ジャンル: ${safeGenre}`,

                      "",

                      "以下の漫才本文に合う、短くて覚えやすいタイトルを1つだけ作ってください。",

                      "",

                      bodyText

                    ].join("\n")

                }

              ],

              max_output_tokens:
                200

            });


        title =
          titleResponse
            ?.choices?.[0]
            ?.message
            ?.content
            ?.trim() ||
          "無題";


        title =
          normalizeTitleString(
            title
          );

      } catch (
        titleError
      ) {

        console.warn(
          "[title generation failed]",
          titleError
        );


        title =
          "無題";
      }
    }


    /* =========================
    最終的な本文チェック
    ========================= */

    bodyText =
      ensureTsukkomiOutro(
        bodyText,
        tsukkomiName
      );


    /* =========================
    クレジット消費
    ========================= */

    const consumption =
      await consumeAfterSuccess(
        user_id
      );


    /* =========================
    レスポンス
    ========================= */

    return res
      .status(200)
      .json({

        ok: true,

        title,

        body:
          bodyText,

        text:
          bodyText,

        script:
          bodyText,

        techniques:
          techniquesForMeta,

        structure:
          structureMeta,

        target_length:
          targetLen,

        min_length:
          minLen,

        max_length:
          maxLen,

        tsukkomi_outro:
          `${tsukkomiName}: もういいよ！`,

        consumed:
          consumption.consumed ??
          null

      });


  } catch (
    err
  ) {

    console.error(
      "[openai error raw]",
      err
    );


    console.error(
      "[openai error cause]",
      err?.cause
    );


    const e =
      normalizeError(
        err
      );


    console.error(
      "[openai error normalized]",
      e
    );


    return res
      .status(
        e.status ||
        500
      )
      .json({

        error:
          "OpenAI request failed",

        detail:
          e,

        cause:
          err?.cause
            ? {

                name:
                  err.cause.name,

                message:
                  err.cause.message,

                code:
                  err.cause.code,

                errno:
                  err.cause.errno,

                syscall:
                  err.cause.syscall,

                hostname:
                  err.cause.hostname

              }

            : null

      });
  }
}
