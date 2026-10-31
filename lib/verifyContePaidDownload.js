// Only for the paid iOS ConteMaker download. No change to ManzaiMaker or Android.
import { SignedDataVerifier, Environment } from "@apple/app-store-server-library";
import { X509Certificate } from "node:crypto";

export async function verifyContePaidDownload(signedAppTransaction) {
  if (typeof signedAppTransaction !== "string" || signedAppTransaction.length < 100 || signedAppTransaction.length > 30000) {
    throw Object.assign(new Error("PAID_APP_PROOF_REQUIRED"), { status: 403, code: "PAID_APP_PROOF_REQUIRED" });
  }
  const bundleId = process.env.APPLE_CONTE_BUNDLE_ID || "com.yutoyamashita.ConteMaker";
  const appId = Number(process.env.APPLE_CONTE_APP_ID || 0);
  const certs = (process.env.APPLE_ROOT_CERTS_BASE64 || "").split(",").filter(Boolean).map(s => {
    const raw = Buffer.from(s.trim(), "base64");
    new X509Certificate(raw);
    return raw;
  });
  if (!certs.length || !Number.isSafeInteger(appId) || appId <= 0) {
    throw Object.assign(new Error("PAID_APP_VERIFIER_NOT_CONFIGURED"), { status: 503 });
  }
  // Explicit environment split; never accept sandbox signatures in production.
  const allowSandbox = process.env.CONTE_PAID_ALLOW_SANDBOX === "true";
  const envs = allowSandbox ? [Environment.PRODUCTION, Environment.SANDBOX] : [Environment.PRODUCTION];
  for (const env of envs) {
    try {
      const verifier = new SignedDataVerifier(certs, true, env, bundleId, env === Environment.PRODUCTION ? appId : undefined);
      const appTransaction = await verifier.verifyAndDecodeAppTransaction(signedAppTransaction);
      if (appTransaction.bundleId !== bundleId) continue;
      if (env === Environment.PRODUCTION && appTransaction.appAppleId !== appId) continue;
      // JWS signature proves Apple's app transaction, not a one-to-one binding
      // between this request/device and the purchase. See migration notes.
      return true;
    } catch { /* try configured next environment */ }
  }
  throw Object.assign(new Error("INVALID_PAID_APP_PROOF"), { status: 403, code: "INVALID_PAID_APP_PROOF" });
}
