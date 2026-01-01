// api/generate.js
export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

// Supabase設定
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

// 技法定義（プロンプト用）
const BOKE_DEFS = { IIMACHIGAI: "言い間違い", HIYU: "比喩ボケ", GYAKUSETSU: "逆説ボケ", GIJI_RONRI: "擬似論理ボケ", TSUKKOMI_BOKE: "ツッコミの伏線", RENSA: "ボケの連鎖", KOTOBA_ASOBI: "言葉遊び" };
const TSUKKOMI_DEFS = { ODOROKI_GIMON: "驚き疑問", AKIRE_REISEI: "呆れ冷静", OKORI: "怒り", KYOKAN: "共感", META: "メタ" };
const GENERAL_DEFS = { SANDAN_OCHI: "三段オチ", GYAKUHARI: "逆張り", TENKAI_HAKAI: "展開破壊", KANCHIGAI_TEISEI: "勘違い訂正", SURECHIGAI: "すれ違い", TACHIBA_GYAKUTEN: "立場逆転" };

export default async function handler(req, res) {
  // iPhoneのデコードエラーを防ぐため、常にJSONで返す設定
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { theme, genre, characters, length, user_id, boke, tsukkomi, general } = req.body || {};
  const names = (characters || "A,B").split(/[、,]/).map(s => s.trim());
  const targetLen = Number(length) || 350;

  try {
    // 1. クレジットチェック
    let used = 0, paid = 0;
    if (supabase && user_id) {
      const { data } = await supabase.from("user_usage").select("output_count, paid_credits").eq("user_id", user_id).maybeSingle();
      used = data?.output_count ?? 0;
      paid = data?.paid_credits ?? 0;
      if (used >= 500 && paid <= 0) return res.status(403).json({ error: "クレジット不足" });
    }

    // 2. 技法の抽出
    const selB = (boke || []).map(k => BOKE_DEFS[k]).filter(Boolean);
    const selT = (tsukkomi || []).map(k => TSUKKOMI_DEFS[k]).filter(Boolean);
    const selG = (general || []).map(k => GENERAL_DEFS[k]).filter(Boolean);

    // 3. プロンプト（1回で完結させる）
    const prompt = `プロの漫才作家として台本を日本語で作成してください。
題材: ${theme}
ジャンル: ${genre}
条件:
- 登場人物: ${names.join(", ")}
- 文字数: ${targetLen}字前後
- 必須技法: ${[...selB, ...selT, ...selG].join(", ") || "比喩、伏線回収"}
- 形式: 1行目に【タイトル】、次に本文。セリフの間は必ず1行空ける。
- 最後は必ず「${names[1] || "B"}: もういいよ！」で締める。`;

    // 4. AI生成 (URLエラー対策: GEMINI_BASE_URLが無くても動くようにフォールバック)
    const baseUrl = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
    const model = "gemini-3-flash-preview"; // ご指定のモデル
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const aiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2500 }
      })
    });

    if (!aiResp.ok) {
      const errData = await aiResp.json();
      throw new Error(`Gemini API Error: ${JSON.stringify(errData)}`);
    }

    const aiData = await aiResp.json();
    const raw = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!raw) throw new Error("AI返答が空です");

    // 5. 高速成形
    let lines = raw.split("\n").map(l => l.trim()).filter(l => l !== "");
    let title = "無題の漫才";
    if (lines[0] && (lines[0].includes("【") || !lines[0].includes(":"))) {
      title = lines[0].replace(/[【】]|タイトル[:：]/g, "");
      lines.shift();
    }
    
    let bodyText = lines.join("\n\n").replace(/(^|\n)([^\n:：]+)[：:]\s*/g, "$1$2: ");
    if (!bodyText.includes("もういいよ")) bodyText += `\n\n${names[1] || "B"}: もういいよ！`;
    
    // 特殊文字排除（iPhoneでの解析エラー防止）
    const cleanBody = bodyText.replace(/[\u2028\u2029]/g, "\n").replace(/[^\x20-\x7E\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\n\r]/g, "");

    // 6. DB更新
    if (supabase && user_id) {
      used += 1;
      if (used > 500 && paid > 0) paid -= 1;
      await supabase.from("user_usage").upsert({ 
        user_id, output_count: used, paid_credits: paid, updated_at: new Date().toISOString() 
      });
    }

    // 7. iPhone (Swift/Codable) 向け完璧なレスポンス
    return res.status(200).json({
      status: "success",
      title: String(title.trim()),
      body: cleanBody,      // アプリが期待するキー
      text: cleanBody,      // アプリが期待するキー2
      content: cleanBody,   // アプリが期待するキー3
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
    // 失敗時もiPhoneが解析できる形式で返す
    return res.status(500).json({ 
      status: "error", 
      title: "エラー", 
      body: "ネタの生成に失敗しました。URL設定またはモデル名を確認してください。",
      meta: { usage_count: 0, paid_credits: 0 } 
    });
  }
}