// api/generate.js
export const config = { runtime: "nodejs" };
import { createClient } from "@supabase/supabase-js";

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

// 共通AI呼び出し
async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }
      ]
    })
  });
  if (!resp.ok) throw new Error("API通信エラー");
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// シンプルな整形関数
function formatScript(rawText) {
  // 1. 無駄な改行やMarkdownの囲い(```)を消去
  let text = rawText.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
  let lines = text.split("\n").map(l => l.trim()).filter(l => l !== "");
  
  if (lines.length === 0) return { title: "無題", body: "" };

  // 2. 1行目をタイトルとして取得（記号を消す）
  let title = lines[0].replace(/[【】「」#]/g, "").replace(/^タイトル[:：]/, "").trim();
  
  // 3. 2行目以降を本文とする。話者コロンを統一
  let bodyLines = lines.slice(1)
    .filter(l => !l.startsWith("（") && !l.startsWith("(")) // ト書き行を除去
    .map(l => l.replace(/[:：]/, ": ")); // コロンを "A: セリフ" の形に

  let body = bodyLines.join("\n\n");
  return { title, body };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const { theme, genre, characters, length, user_id } = req.body;
  const names = (characters || "A,B").split(/[、,]/).map(s => s.trim());
  const apiKey = process.env.GEMINI_API_KEY;

  const min = Math.floor(length * 0.9);
  const max = Math.floor(length * 1.1);

  try {
    // クレジットチェック
    let used = 0, paid = 0;
    if (supabase && user_id) {
      const { data } = await supabase.from("user_usage").select("output_count, paid_credits").eq("user_id", user_id).maybeSingle();
      used = data?.output_count ?? 0;
      paid = data?.paid_credits ?? 0;
    }

    // プロンプト作成（シンプルかつ強力に）
    const prompt = `漫才作家として「${theme}」を題材にした${genre}漫才を作ってください。
以下のルールを厳守してください：
1. 1行目：【タイトル】
2. 2行目以降：漫才のセリフ（「名前: セリフ」の形式）
3. 最後に「もういいよ！」で終わる。
4. 全体の総文字数を必ず「${min}文字〜${max}文字」にする。
5. 余計な挨拶、解説、ト書き（かっこ書き）は一切書かない。

登場人物：${names.join(", ")}`;

    let raw = await callGemini(prompt, apiKey);
    let result = formatScript(raw);

    // 文字数が大幅に違う場合のみ1回だけリトライ
    if (result.body.length < min || result.body.length > max) {
      const retryPrompt = `以下の漫才を、内容は変えず「${min}〜${max}文字」になるように調整して出力し直してください。現在${result.body.length}文字です。解説は不要です。\n\n${raw}`;
      raw = await callGemini(retryPrompt, apiKey);
      result = formatScript(raw);
    }

    // DB更新
    if (supabase && user_id) {
      await supabase.from("user_usage").upsert({
        user_id, output_count: used + 1, updated_at: new Date().toISOString()
      });
    }

    // レスポンス
    return res.status(200).json({
      status: "success",
      title: result.title,
      body: result.body,
      text: result.body, // 互換性のため
      meta: {
        actual_length: result.body.length,
        target_length: length
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", body: "生成に失敗しました。" });
  }
}