// api/generate.js
export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

// Supabase設定
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

/* =========================
1. 技法 定義テーブル
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

// 共通AI呼び出し関数（エラーハンドリング付き）
async function callGemini(prompt, apiKey) {
  const baseUrl = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  const model = "gemini-3-flash-preview"; 
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
    })
  });

  if (!resp.ok) {
    const errData = await resp.json();
    throw new Error(`Gemini API Error: ${JSON.stringify(errData)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("AI返答が空です");
  return text;
}

// テキスト整形関数
function formatScript(rawText, names) {
  let lines = rawText.split("\n").map(l => l.trim()).filter(l => l !== "");
  let title = "無題の漫才";

  // タイトル行の抽出と除去（強化版）
  if (lines[0]) {
    const rawTitle = lines[0];
    const cleanTitle = rawTitle
      .replace(/^(タイトル|Title)\s*[:：\-]?\s*/i, "") // "タイトル:"を除去
      .replace(/[\[\]【】「」""]/g, "") // 【】、「」、[]、"" を除去
      .replace(/^[\#\s]+/, "") // Markdownの#を除去
      .trim();
    
    // 1行目が「名前: セリフ」の形式でない場合のみタイトルとみなす
    if (cleanTitle && !rawTitle.includes(":")) {
      title = cleanTitle;
      lines.shift();
    }
  }

  // 本文成形：修正箇所
  // 1. join("\n") で結合
  // 2. replace(/\n{2,}/g, "\n") で連続する改行を強制的に1つにする
  let bodyText = lines.join("\n").replace(/\n{2,}/g, "\n");

  // 話者コロンの正規化
  bodyText = bodyText.replace(/(^|\n)([^\n:：]+)[：:]\s*/g, "$1$2: ");
  
  const outro = `${names[1] || "B"}: もういいよ！`;
  if (!bodyText.includes("もういいよ")) {
    // 結合時も \n 1つにする
    bodyText = bodyText.trim() + "\n" + outro;
  }

  // 特殊文字排除
  const cleanBody = bodyText.replace(/[\u2028\u2029]/g, "\n").replace(/[^\x20-\x7E\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\n\r]/g, "");
  
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

    // 3. 初回プロンプト（文字数厳守を強調）
    const initialPrompt = `プロの漫才作家として台本を日本語で作成してください。
題材: ${theme}
ジャンル: ${genre}
条件:
- 登場人物: ${names.join(", ")}
- 【最重要】文字数: 必ず「${minLimit}文字以上、${maxLimit}文字以下」に収めてください。これより短くても長くてもいけません。
- 形式: 1行目に【タイトル】、次に本文。セリフの間には必ず「1行の空白」のみを入れてください。
- 最後は必ず「${names[1] || "B"}: もういいよ！」で締める。

■採用する技法:
${techniquesText}`;

    // 4. 初回AI生成
    const rawText1 = await callGemini(initialPrompt, apiKey);
    let { title, cleanBody } = formatScript(rawText1, names);

    // 5. 【自己検証プロセス】文字数が範囲外なら修正（リトライ）
    const currentLen = cleanBody.length;
    
    // 範囲外（±10%を超えている）の場合のみ、修正AIコールを実行
    if (currentLen < minLimit || currentLen > maxLimit) {
      // 修正指示の作成
      let fixInstruction = "";
      if (currentLen < minLimit) {
        fixInstruction = `現在の文字数は ${currentLen}文字 で、目標（${minLimit}〜${maxLimit}文字）より短すぎます。内容を膨らませて、ボケを増やし、必ず${minLimit}文字以上にしてください。`;
      } else {
        fixInstruction = `現在の文字数は ${currentLen}文字 で、目標（${minLimit}〜${maxLimit}文字）より長すぎます。内容は変えず、無駄な言葉を削って必ず${maxLimit}文字以下に要約してください。`;
      }

      const retryPrompt = `以下の漫才台本を修正してください。
【修正指示】: ${fixInstruction}

- 形式（タイトル行、セリフ間の空行、最後の「もういいよ！」）は維持してください。
- 技法はそのまま活かしてください。

【現在の台本】:
【${title}】
${cleanBody}`;

      try {
        // リトライ生成（高速化のため同じモデルを使用）
        const rawText2 = await callGemini(retryPrompt, apiKey);
        // 再フォーマット
        const res2 = formatScript(rawText2, names);
        // タイトルが変わってなければ元のタイトルを優先（空でなければ新しいタイトル採用）
        if (res2.title && res2.title !== "無題の漫才") {
            title = res2.title;
        }
        cleanBody = res2.cleanBody;
      } catch (e) {
        console.warn("Retry generation failed:", e);
        // リトライ失敗時は初回生成分を返す（エラーにはしない）
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

    // 7. iPhoneレスポンス
    return res.status(200).json({
      status: "success",
      title: String(title),
      body: cleanBody,
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