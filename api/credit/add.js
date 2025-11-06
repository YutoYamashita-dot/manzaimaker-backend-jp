// api/credit/add.js
export const config = { runtime: "nodejs" };
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// フロント仕様：credit_100 のみ許可（100円=100クレジット）
const ALLOWED_PRODUCT_ID = "credit_100";
const CREDIT_100_AMOUNT = 100;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { user_id, product_id } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ error: "bad params: user_id required" });
    }

    // 任意deltaは受け付けない。credit_100 のみ +100 を許可
    if (product_id !== ALLOWED_PRODUCT_ID) {
      return res.status(400).json({ error: "unsupported product_id" });
    }

    // 現在残高を取得
    const { data, error } = await supabase
      .from("user_usage")
      .select("paid_credits, output_count")
      .eq("user_id", user_id)
      .maybeSingle();
    if (error) throw error;

    const curPaid = data?.paid_credits ?? 0;
    const nextPaid = curPaid + CREDIT_100_AMOUNT;

    // upsert（なければ作成）
    const { error: upErr } = await supabase
      .from("user_usage")
      .upsert({
        user_id,
        paid_credits: nextPaid,
        output_count: data?.output_count ?? 0,
        updated_at: new Date().toISOString(),
      });

    if (upErr) throw upErr;

    return res.status(200).json({
      ok: true,
      product_id: ALLOWED_PRODUCT_ID,
      paid_credits: nextPaid,
      added: CREDIT_100_AMOUNT,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server Error" });
  }
}