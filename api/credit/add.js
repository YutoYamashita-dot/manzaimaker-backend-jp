// LEGACY COMPATIBILITY ONLY. WARNING: no purchase verification, publicly abusable.
// Match pre-existing endpoint contract exactly; do not route iOS StoreKit here.
export const config = { runtime: "nodejs" };
import { createClient } from "@supabase/supabase-js";
const PRODUCT = "credit_100";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const {user_id, product_id} = req.body || {};
  if (!user_id) return res.status(400).json({ error: "bad params: user_id required" });
  if (product_id !== PRODUCT) return res.status(400).json({ error: "unsupported product_id" });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return res.status(503).json({ error: "Supabase configuration missing" });
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {data, error} = await supabase.from("user_usage").select("paid_credits,output_count")
      .eq("user_id",user_id).maybeSingle();
    if (error) throw error;
    const paid = (data?.paid_credits ?? 0) + 100;
    const {error: err} = await supabase.from("user_usage").upsert({
      user_id, paid_credits:paid, output_count:data?.output_count ?? 0, updated_at:new Date().toISOString()
    });
    if (err) throw err;
    return res.status(200).json({ok:true, product_id: PRODUCT, paid_credits:paid, added:100});
  } catch(e) {console.error(e);return res.status(500).json({error:"Server Error"});}
}
