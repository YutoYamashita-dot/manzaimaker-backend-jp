// api/generate.js
export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

/* =========================
1. 技法 定義テーブル（削除せず維持）
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

/* --- 技法ガイドライン作成（「必ず1回以上使用」を強調） --- */
function buildGuideline(selected) {
  const b = (selected.boke || []).map(k => BOKE_DEFS[k]).filter(Boolean);
  const t = (selected.tsukkomi || []).map(k => TSUKKOMI_DEFS[k]).filter(Boolean);
  const g = (selected.general || []).map(k => GENERAL_DEFS[k]).filter(Boolean);
  
  if (!b.length && !t.length && !g.length) return "- 比喩、ボケのエスカレーション、伏線回収";

  let res = "以下の技法を【それぞれ必ず1回以上】台本の中で具体的に実演してください。未使用は禁止です。";
  if (b.length) res += "\n\n【ボケの必須技法】\n" + b.map(s => "- " + s).join("\n");
  if (t.length) res += "\n\n【ツッコミの必須技法】\n" + t.map(s => "- " + s).join("\n");
  if (g.length) res += "\n\n【全体構成の必須技法】\n" + g.map(s => "- " + s).join("\n");
  return res;
}

/* --- クレジット管理ユーティリティ (維持) --- */
async function getUsageRow(user_id) {
  if (!supabase || !user_id) return { output_count: 0, paid_credits: 0 };
  const { data } = await supabase.from("user_usage").select("output_count, paid_credits").eq("user_id", user_id).maybeSingle();
  return data || { output_count: 0, paid_credits: 0 };
}

async function consumeCredit(user_id) {
  if (!supabase || !user_id) return;
  const row = await getUsageRow(user_id);
  let { output_count, paid_credits } = row;
  if (output_count < 500) { output_count++; } 
  else if (paid_credits > 0) { paid_credits--; output_count++; }
  await supabase.from("user_usage").upsert({ user_id, output_count, paid_credits, updated_at: new Date().toISOString() });
}

/* --- 整形ユーティリティ (維持) --- */
function finalizeText(text, name = "B") {
  let t = text.replace(/(^|\n)([^\n:：]+)[：:]\s*/g, "$1$2: ").trim(); 
  const lines = t.split("\n").filter(l => l.trim() !== "");
  t = lines.join("\n\n"); 
  const outro = `${name}: もういいよ！`;
  if (!t.includes("もういいよ")) t += "\n\n" + outro;
  return t.replace(/[\u2028\u2029]/g, "\n").replace(/[^\x20-\x7E\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\n\r]/g, "");
}

/* =========================
主処理：HTTP ハンドラ
========================= */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { theme, genre, characters, length, user_id, action, product_id, boke, tsukkomi, general } = req.body || {};

  // 1. 購入反映
  if (action === "add_credit") {
    const row = await getUsageRow(user_id);
    const next = (row.paid_credits || 0) + 100;
    await supabase.from("user_usage").upsert({ user_id, output_count: row.output_count, paid_credits: next });
    return res.status(200).json({ ok: true, paid_credits: next });
  }

  try {
    // 2. クレジットチェック
    const row = await getUsageRow(user_id);
    if ((row.output_count || 0) >= 500 && (row.paid_credits || 0) <= 0) {
      return res.status(403).json({ error: "クレジット不足" });
    }

    // 3. プロンプト作成（技法遵守の命令を極限まで強化）
    const names = (characters || "A,B").split(/[、,]/).map(s => s.trim());
    const targetLen = Number(length) || 350;
    const guidelines = buildGuideline({ boke, tsukkomi, general });

    const prompt = `あなたは日本一の漫才作家です。題材「${theme}」を用いて、以下の「絶対条件」を【1回の出力で完璧に満たして】台本を書き上げてください。

■絶対遵守条件:
1. 指定された【技法】を、ボケとツッコミの掛け合いの中で、最低1回以上【必ず具体的に実演】してください。
2. 形式: 1行目に漫才に相応しい【タイトル】、次に本文。セリフの間には必ず空行を1行入れること。
3. 文字数: 必ず ${targetLen}文字以上 ${Math.ceil(targetLen * 1.3)}文字以内。
4. 構成: 序盤の「フリ」、中盤の「ボケの加速（インフレ）」、終盤の「伏線回収」を必ず含むこと。
5. 結び: 最後は必ず「${names[1] || "B"}: もういいよ！」という一行で終わること。

■採用する技法（1回以上必須）:
${guidelines}

■ルール:
- 技法の説明文（例：「比喩ボケを使う」など）は本文に書かないでください。
- セリフは「名前: セリフ」の形式を厳守してください。
- 具体的かつ現実的な固有名詞や数字を使い、映像が浮かぶようにしてください。`;

    // 4. AI呼び出し (1回に集約することでiPhoneの30秒制限を回避)
    const aiUrl = `${process.env.GEMINI_BASE_URL}/models/${process.env.GEMINI_MODEL || 'gemini-1.5-flash'}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const aiResp = await fetch(aiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }], 
        generationConfig: { temperature: 0.8, maxOutputTokens: 3000 } 
      })
    });

    const aiData = await aiResp.json();
    const rawContent = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!rawContent) throw new Error("AIエラー");

    // 5. 高速整形
    let parts = rawContent.split("\n").filter(l => l.trim() !== "");
    let title = "無題の漫才";
    if (parts[0].includes("【") || parts[0].includes("タイトル") || !parts[0].includes(":")) {
      title = parts[0].replace(/[【】]|タイトル[:：]/g, "");
      parts.shift();
    }
    const body = finalizeText(parts.join("\n"), names[1] || "B");

    // 6. 成功時のみクレジット消費
    await consumeCredit(user_id);
    const finalRow = await getUsageRow(user_id);

    // 7. iPhone用レスポンス
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({
      status: "success",
      title: title.trim(),
      body: body,
      text: body,
      content: body,
      meta: {
        usage_count: Math.floor(finalRow.output_count),
        paid_credits: Math.floor(finalRow.paid_credits),
        actual_length: body.length
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server Error" });
  }
}