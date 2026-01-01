// api/generate.js
export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

// Supabase設定
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

/* =========================
1. 技法 定義テーブル（詳細版）
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

export default async function handler(req, res) {
  // iPhoneのデコードエラーを防ぐため、常にJSONで返す設定
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { theme, genre, characters, length, user_id, boke, tsukkomi, general } = req.body || {};
  const names = (characters || "A,B").split(/[、,]/).map(s => s.trim());
  const targetLen = Number(length) || 350;

  // 文字数±5%の計算（厳格な制限用）
  const minLen = Math.floor(targetLen * 0.95);
  const maxLen = Math.floor(targetLen * 1.05);

  try {
    // 1. クレジットチェック
    let used = 0, paid = 0;
    if (supabase && user_id) {
      const { data } = await supabase.from("user_usage").select("output_count, paid_credits").eq("user_id", user_id).maybeSingle();
      used = data?.output_count ?? 0;
      paid = data?.paid_credits ?? 0;
      if (used >= 500 && paid <= 0) return res.status(403).json({ error: "クレジット不足" });
    }

    // 2. 技法の抽出（詳細な定義文を取得）
    const selB = (boke || []).map(k => BOKE_DEFS[k]).filter(Boolean);
    const selT = (tsukkomi || []).map(k => TSUKKOMI_DEFS[k]).filter(Boolean);
    const selG = (general || []).map(k => GENERAL_DEFS[k]).filter(Boolean);
    
    // プロンプト用にリスト化
    const techniquesText = [...selB, ...selT, ...selG].map(t => `・${t}`).join("\n") || "・比喩表現で例える\n・伏線を回収する";

    // 3. プロンプト（1回で完結させる）
    const prompt = `プロの漫才作家として台本を日本語で作成してください。
題材: ${theme}
ジャンル: ${genre}
条件:
- 登場人物: ${names.join(", ")}
- 【超重要】文字数: 空白や話者名を含めた全体文字数を、必ず「${minLen}字〜${maxLen}字」の範囲内に収めてください。短すぎても長すぎてもいけません。
- 形式: 1行目に【タイトル】、次に本文。セリフの間には必ず「1行の空白」のみを入れてください。
- 最後は必ず「${names[1] || "B"}: もういいよ！」で締める。

■採用する技法（以下の技法を必ず台本内で実践してください）:
${techniquesText}`;

    // 4. AI生成
    const baseUrl = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
    const model = "gemini-3-flash-preview"; 
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const aiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 3500 } // 少しトークン余裕を持たせる
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
    // 空行を一度すべて排除してから join("\n\n") することで正確に1行の空白にする
    let lines = raw.split("\n").map(l => l.trim()).filter(l => l !== "");
    let title = "無題の漫才";
    if (lines[0] && (lines[0].includes("【") || !lines[0].includes(":"))) {
      title = lines[0].replace(/[【】]|タイトル[:：]/g, "");
      lines.shift();
    }
    
    // 話者コロンの正規化と、セリフ間1行空けの適用
    let bodyText = lines.join("\n\n").replace(/(^|\n)([^\n:：]+)[：:]\s*/g, "$1$2: ");
    
    // オチの付与
    const outro = `${names[1] || "B"}: もういいよ！`;
    if (!bodyText.includes("もういいよ")) {
      bodyText = bodyText.trim() + "\n\n" + outro;
    }

    // 文字数の最終的な強制トリミング（+5%の上限を超過した場合のみカット）
    if (bodyText.length > maxLen) {
        // オチの分を確保してカット
        let tempText = bodyText.substring(0, maxLen - outro.length - 10);
        // キリの良い文末（。！？）を探す
        const lastPunc = Math.max(tempText.lastIndexOf("。"), tempText.lastIndexOf("！"), tempText.lastIndexOf("？"));
        if (lastPunc > targetLen * 0.5) { // ある程度長さがあればそこで切る
            bodyText = tempText.substring(0, lastPunc + 1) + "\n\n" + outro;
        } else {
            // 文末が見つからない場合は強制的に切ってオチをつける
            bodyText = tempText + "…\n\n" + outro;
        }
    }
    
    // 特殊文字排除（iPhoneでの解析エラー防止）
    const cleanBody = bodyText.replace(/[\u2028\u2029]/g, "\n").replace(/[^\x20-\x7E\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\n\r]/g, "");

    // 6. DB更新（成功時のみ消費）
    if (supabase && user_id) {
      used += 1;
      if (used > 500 && paid > 0) paid -= 1;
      await supabase.from("user_usage").upsert({ 
        user_id, output_count: used, paid_credits: paid, updated_at: new Date().toISOString() 
      });
    }

    // 7. iPhone (Swift/Codable) 向けレスポンス
    return res.status(200).json({
      status: "success",
      title: String(title.trim()),
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