export const config = { runtime: "nodejs" };
import { createClient } from "@supabase/supabase-js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const userId = String(req.body?.user_id || "").trim();
  if (!userId || userId.length > 256) return res.status(400).json({ error: "user_id required" });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Server configuration missing" });
  const mode = String(req.body?.mode || "conte").toLowerCase();
  const scoped = mode === "conte" && !userId.startsWith("conte_") ? `conte_${userId}` : userId;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from("user_usage")
    .select("paid_credits,output_count").eq("user_id",scoped).maybeSingle();
  if (error) return res.status(500).json({ error: "Balance unavailable" });
  return res.status(200).json({ paid_credits:data?.paid_credits ?? 0, usage_count:data?.output_count ?? 0 });
}
