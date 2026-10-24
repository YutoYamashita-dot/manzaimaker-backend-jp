// POST /api/iap/verify : verifies a StoreKit 2 signed transaction with Apple roots.
// Important: user_id is still a legacy device ID, not an authenticated account.
export const config = { runtime: "nodejs" };
import { createClient } from "@supabase/supabase-js";
import { SignedDataVerifier, Environment } from "@apple/app-store-server-library";
import { X509Certificate } from "node:crypto";

const PRODUCT = "unlimited_unlock";
const UNLIMITED = 999999;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createVerifier(environment) {
  const base64 = process.env.APPLE_ROOT_CERTS_BASE64 || "";
  const roots = base64.split(",").map(s => s.trim()).filter(Boolean).map(s => {
    const raw = Buffer.from(s, "base64");
    // Apple verifier accepts DER certificate Buffers.
    new X509Certificate(raw); // reject malformed roots at startup
    return raw;
  });
  const bundle = process.env.APPLE_BUNDLE_ID || "";
  const appId = Number(process.env.APPLE_APP_ID);
  if (!roots.length || !bundle || (environment === Environment.PRODUCTION && (!Number.isSafeInteger(appId) || appId <= 0))) {
    throw new Error("App Store verifier configuration is incomplete");
  }
  return new SignedDataVerifier(roots, true, environment, bundle,
    environment === Environment.PRODUCTION ? appId : undefined);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const { signed_transaction, user_id, app_account_token } = req.body || {};
  if (typeof signed_transaction !== "string" || signed_transaction.length > 30000 ||
      signed_transaction.split(".").length !== 3 || typeof user_id !== "string" ||
      !user_id.trim() || user_id.length > 200 || !UUID_REGEX.test(String(app_account_token || ""))) {
    return res.status(400).json({ error: "Invalid purchase request" });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Database not configured" });
  }
  let decoded;
  try {
    // Choose environment from cryptographically verified result; never trust client selection.
    const environments = [Environment.PRODUCTION, Environment.SANDBOX];
    for (const env of environments) {
      try {
        const payload = await createVerifier(env).verifyAndDecodeTransaction(signed_transaction);
        decoded = payload;
        break;
      } catch { /* try next known environment */ }
    }
    if (!decoded) return res.status(422).json({ error: "Apple signature verification failed" });
    if (decoded.productId !== PRODUCT || decoded.type !== "Non-Consumable" ||
        String(decoded.appAccountToken || "").toLowerCase() !== app_account_token.toLowerCase() ||
        decoded.revocationDate != null || !decoded.transactionId ||
        decoded.bundleId !== process.env.APPLE_BUNDLE_ID ||
        (decoded.quantity != null && decoded.quantity !== 1)) {
      return res.status(422).json({ error: "Purchase attributes mismatch" });
    }
    const scopedId = user_id.startsWith("conte_") ? user_id : `conte_${user_id}`;
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.rpc("apply_verified_apple_unlock", {
      p_user_id: scopedId,
      p_transaction_id: String(decoded.transactionId),
      p_product_id: PRODUCT,
      p_app_account_token: String(decoded.appAccountToken).toLowerCase(),
      p_environment: String(decoded.environment || "")
    });
    if (error) { console.error("purchase credit rpc failed", error); return res.status(503).json({ error: "Credit delivery temporarily unavailable" }); }
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.status === "conflict") return res.status(409).json({ error: "Transaction already belongs to another account" });
    return res.status(200).json({ ok: true, granted: result?.status === "credited", already_processed: result?.status === "duplicate", paid_credits: result?.paid_credits, unlimited: true });
  } catch (err) {
    console.error("iap verification failed", err);
    return res.status(503).json({ error: "Purchase verification unavailable" });
  }
}
