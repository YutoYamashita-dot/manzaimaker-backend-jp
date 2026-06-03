// api/generate.js
export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

// Supabase設定
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

/* =========================
技法 定義テーブル
========================= */
const BOKE_DEFS = {
  IIMACHIGAI: "言い間違い／聞き間違い：音韻のズレで意外性を生むボケ。",
  HIYU: "比喩ボケ：比喩で誇張してのボケ",
  GYAKUSETSU: "逆説ボケ：一見正論に聞こえるが論理が破綻しているボケ。",
  GIJI_RONRI: "擬似論理ボケ：論理風だが中身がズレているボケ。",
  TSUKKOMI_BOKE: "ツッコミの発言が次のボケの伏線になるボケ。",
  RENSA: "ボケの連鎖：ボケが次のボケを誘発するように連続させ、加速感を生むボケ。",
  KOTOBA_ASOBI: "言葉遊び：ダジャレ・韻などで言語的にふざける。",
};

const TSUKKOMI_DEFS = {
  ODOROKI_GIMON: "驚き・疑問ツッコミ：観客の代弁として即時の驚き・疑問でのツッコミ。",
  AKIRE_REISEI: "呆れ・冷静ツッコミ：感情を抑えた冷静な態度でのツッコミ。",
  OKORI: "怒りツッコミ：怒ったような言い方でのツッコミ。",
  KYOKAN: "共感ツッコミ：相手の感情に一度共感してから、ツッコミをする。",
  META: "メタツッコミ：漫才の形式・構造そのものを指摘するツッコミ。",
};

const GENERAL_DEFS = {
  SANDAN_OCHI: "三段オチ：1・2をフリ、3で意外なオチ。",
  GYAKUHARI: "逆張り構成：期待・常識を外して予想を逆手に取る。",
  TENKAI_HAKAI: "展開破壊：築いた流れを意図的に壊し異質な要素を挿入。",
  KANCHIGAI_TEISEI: "勘違い→訂正：ボケの勘違いをツッコミが訂正する構成。",
  SURECHIGAI: "すれ違い：互いの前提が噛み合わずズレ続けて笑いを生む。",
  TACHIBA_GYAKUTEN: "立場逆転：途中または終盤で役割・地位がひっくり返る。",
};

// 共通システム指示 (AIの役割と厳密なフォーマット規則を固定)
const SYSTEM_INSTRUCTION = `あなたはプロの漫才作家です。指示に従い、指定された形式で爆笑できる漫才台本を日本語で作成または修正してください。

■ 出力フォーマットの厳格なルール：
1. 1行目は【タイトル】のみを出力してください。（例：【タイトルの名前】）※「タイトル: 」などの余計な記述やMarkdownの「#」は絶対に含めないでください。
2. 2行目以降が本文（台本）となります。
3. セリフの間には、必ず「1行の空白（空行）」を1つだけ入れてください。
4. 話者とセリフは半角コロンまたは全角コロンで区切ってください。（例：A: 〜〜 または A：〜〜）
5. 台本の最後は、ツッコミ側のセリフ「もういいよ！」で終わるようにしてください。
6. Markdownの装飾記号（「#」や「**」、「\`\`\`」など）は、出力に一切含めないでください。プレーンテキストのみで出力してください。`;

// 共通AI呼び出し関数（セーフティ設定およびシステム指示に対応）
async function callGemini(prompt, systemInstruction, apiKey) {
  const baseUrl = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  const model = "gemini-3.5-flash";
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { 
      temperature: 0.7, 
      maxOutputTokens: 4000 
    },
    // 漫才の特異な表現（激しいツッコミ、ボケなど）による安全フィルターの誤検知を完全に回避
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  if (!resp.ok) {
    const errData = await resp.json();
    throw new Error(`Gemini API Error: ${JSON.stringify(errData)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  if (!text) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason) {
      throw new Error(`AI返答が空です (理由: ${finishReason})`);
    }
    throw new Error("AI返答が空です");
  }
  return text;
}

// テキスト整形関数 (Android/iOS側の表示・パースエラーを防ぐためのクレンジング強化版)
function formatScript(rawText, names) {
  // 改行コードを \n に統一し、不要な空白を除去
  let cleanText = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  let title = "無題の漫才";

  // 1. 【タイトル】を確実に抽出（隅付き括弧から取り出す）
  const titleMatch = cleanText.match(/【([^】]+)】/);
  if (titleMatch) {
    title = titleMatch[1]
      .replace(/^(タイトル|Title)\s*[:：-]?\s*/i, "")
      .replace(/タイトル/g, "")
      .replace(/[\[\]「」""]/g, "")
      .trim();
    
    // 抽出したタイトル部分（【...】）を本文から削除
    cleanText = cleanText.replace(/【[^】]+】/, "").trim();
  }

  let lines = cleanText.split("\n").map(l => l.trim());

  // 2. 台本前の「前置き（AIの挨拶など）」の自動カット
  // セリフの開始形式（「話者名:」または「話者名：」）を検知するまで先頭行を削除し続ける
  while (lines.length > 0) {
    const firstLine = lines[0];
    if (firstLine === "") {
      lines.shift();
      continue;
    }
    const isDialogue = /^[^\s:：]+[:：]/.test(firstLine);
    if (!isDialogue) {
      lines.shift(); // 前置きとみなして削除
    } else {
      break;
    }
  }

  // 3. 台本後の「後書き（AIの解説など）」の自動カット
  // 末尾から、セリフ形式でも「もういいよ」でもない不要な解説文を削除
  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    if (lastLine === "") {
      lines.pop();
      continue;
    }
    const isDialogue = /^[^\s:：]+[:：]/.test(lastLine) || lastLine.includes("もういいよ");
    if (!isDialogue) {
      lines.pop(); // 後書きとみなして削除
    } else {
      break;
    }
  }

  // 4. 空行をリセットし、セリフ間の空行を「1行」に統一
  let tempLines = lines.filter(l => l !== "");
  let bodyText = tempLines.join("\n\n").replace(/\n{3,}/g, "\n\n");

  // 5. コロンの半角コロン＋半角スペースへの正規化 (例: "A: セリフ")
  // これによりアプリ側でのコロン分割（スプリット）やアイコン配置が100%安定します
  bodyText = bodyText.replace(/(^|\n)([^\n:：]+)[：:]\s*/g, "$1$2: ");

  const outro = `${names[1] || "B"}: もういいよ！`;

  // 6. 「もういいよ」の重複防止と最終オチの付与
  bodyText = bodyText.trim().replace(/(?:^|\n).*?もういいよ[！!]*$/g, "");
  bodyText = bodyText.trim() + "\n\n" + outro;

  // 7. 特殊文字・無効な制御コード（アプリクラッシュの原因）の徹底排除
  const cleanBody = bodyText
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[^\x20-\x7E\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\n\r]/g, "");

  return { title, cleanBody };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { theme, genre, characters, length, user_id, boke, tsukkomi, general } = req.body || {};
  const names = (characters || "A,B").split(/[、,]/).map(s => s.trim());
  const apiKey = process.env.GEMINI_API_KEY;

  // 目標文字数設定
  const targetLen = Number(length) || 350;
  // ★上下10%の厳格な範囲設定
  const minLimit = Math.floor(targetLen * 0.9);
  const maxLimit = Math.floor(targetLen * 1.1);

  try {
    // 1. クレジットチェック
    let used = 0, paid = 0;
    if (supabase && user_id) {
      const { data } = await supabase.from("user_usage").select("output_count, paid_credits").eq("user_id", user_id).maybeSingle();
      used = data?.output_count ?? 0;
      paid = data?.paid_credits ?? 0;
      if (used >= 500 && paid <= 0) return res.status(403).json({ error: "クレジット不足" });
    }

    // 2. 技法プロンプト作成
    const selB = (boke || []).map(k => BOKE_DEFS[k]).filter(Boolean);
    const selT = (tsukkomi || []).map(k => TSUKKOMI_DEFS[k]).filter(Boolean);
    const selG = (general || []).map(k => GENERAL_DEFS[k]).filter(Boolean);
    const techniquesText = [...selB, ...selT, ...selG].map(t => `・${t}`).join("\n") || "・比喩表現で例える\n・伏線を回収する";

    // LLMに文字数のスケール感を掴ませるための行数目安の自動計算
    const estimatedLines = Math.round(targetLen / 22);
    const estimatedTurns = Math.round(estimatedLines / 2);

    // 3. 初回プロンプト（不要な装飾や挨拶の徹底排除を強調）
    const initialPrompt = `以下の指示と条件に従い、漫才台本を生成してください。

題材: ${theme}
ジャンル: ${genre}
条件:
- 登場人物: ${names.join(", ")}
- 【最重要】文字数制限: 台本本文（タイトルや空白行を除く、セリフ部分の総文字数）は、必ず「${minLimit}文字以上、${maxLimit}文字以下」に収めてください。これより短くても長くてもいけません。
- 【分量の目安】: 合計で約 ${estimatedLines} 行（登場人物同士のセリフが約 ${estimatedTurns} 往復。1つのセリフあたり平均 15〜25 文字程度）で構成すると、ちょうど目標文字数に収まりやすくなります。
- 題材（${theme}）に関連した、ちょっとしたツカミ要素を入れること。
- 題材（${theme}）をフリとして、多くの人が薄々知っている/思っているけどあえて口に出しては言わないことをボケやツッコミとして必ず複数回入れてください。
- 題材（${theme}）に関連した、大喜利の回答のようなボケやツッコミを必ず複数回入れてください。
- 演出上の指示（括弧書きなど）や、Markdownの装飾記号（#や**、\`\`\`等）は出力しないでください。プレーンテキストのみで出力してください。

■ 採用する技法:
${techniquesText}`;

    // 4. 初回AI生成
    const rawText1 = await callGemini(initialPrompt, SYSTEM_INSTRUCTION, apiKey);
    let { title, cleanBody } = formatScript(rawText1, names);

    // 5. 【自己検証プロセス】文字数が範囲外なら修正（最大3回までループ処理）
    let currentLen = cleanBody.length;
    let attempt = 0;
    const maxAttempts = 3;

    while ((currentLen < minLimit || currentLen > maxLimit) && attempt < maxAttempts - 1) {
      attempt++;
      let fixInstruction = "";
      
      if (currentLen < minLimit) {
        const diff = targetLen - currentLen;
        fixInstruction = `現在の文字数は ${currentLen}文字 で、目標（${minLimit}〜${maxLimit}文字 / 中央値 ${targetLen}文字）に対して少なすぎます。
あと約 ${diff}文字 ほど内容が不足しています。現在のストーリー展開や設定は壊さず、ボケのやりとりを2〜3往復分追加して内容を肉付けし、必ず ${minLimit}文字以上 にしてください。`;
      } else {
        const diff = currentLen - targetLen;
        fixInstruction = `現在の文字数は ${currentLen}文字 で、目標（${minLimit}〜${maxLimit}文字 / 中央値 ${targetLen}文字）に対して多すぎます。
約 ${diff}文字 ほど長すぎます。話の筋道や面白いボケは変えないまま、冗長なセリフ表現を削り、不要な「あの〜」「えっと」などのつなぎ言葉を取り除くかセリフを圧縮して、必ず ${maxLimit}文字以下 にしてください。`;
      }

      const retryPrompt = `以下の現在の漫才台本を指示通りに修正してください。

【修正指示】: ${fixInstruction}
- 形式（タイトル行、セリフ間の空行、最後の「もういいよ！」）は厳格に維持してください。
- 技法や題材はそのまま活かしてください。
- Markdownなどの余計な装飾記号は一切加えないでください。

【現在の台本】:
【${title}】
${cleanBody}`;

      try {
        const rawTextRetry = await callGemini(retryPrompt, SYSTEM_INSTRUCTION, apiKey);
        const resRetry = formatScript(rawTextRetry, names);
        if (resRetry.title && resRetry.title !== "無題の漫才") {
          title = resRetry.title;
        }
        cleanBody = resRetry.cleanBody;
        currentLen = cleanBody.length;
      } catch (e) {
        console.warn(`Retry generation attempt ${attempt} failed:`, e);
        break;
      }
    }

    // 6. DB更新（成功時のみ消費）
    if (supabase && user_id) {
      used += 1;
      if (used > 500 && paid > 0) paid -= 1;
      await supabase.from("user_usage").upsert({
        user_id, output_count: used, paid_credits: paid, updated_at: new Date().toISOString()
      });
    }

    // 7. レスポンス (クライアントアプリ側が非常に扱いやすいシンプルなキーでも返却)
    return res.status(200).json({
      status: "success",
      title: String(title),  // アプリ側では、この括弧なしのきれいなタイトルを表示してください。
      body: cleanBody,       // アプリ側では、この前置き・後書きのないきれいな台本本文を表示してください。
      text: cleanBody,
      content: cleanBody,
      meta: {
        structure: selG.length ? selG : ["導入", "展開", "オチ"],
        techniques: [...selB, ...selT].length ? [...selB, ...selT] : ["ボケ", "ツッコミ"],
        usage_count: Math.floor(used),
        paid_credits: Math.floor(paid),
        actual_length: cleanBody.length,
        target_length: targetLen
      }
    });
  } catch (err) {
    console.error("Handler Error:", err.message);
    return res.status(500).json({
      status: "error",
      title: "エラー",
      body: "ネタの生成に失敗しました。時間をおいて試してください。",
      meta: { usage_count: 0, paid_credits: 0 }
    });
  }
}