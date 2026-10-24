
 // POST /api/iap/verify
 // StoreKit 2 の署名付き購入情報を検証する。
 // 漫才メーカーとコントメーカーの購入権を分離する。
 // 既存のコントメーカーの user_id 形式は維持する。

export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import {
  SignedDataVerifier,
  Environment
} from "@apple/app-store-server-library";
import { X509Certificate } from "node:crypto";

const PRODUCT = "unlimited_unlock";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Appleルート証明書を取得
function getAppleRoots() {
  const base64 = process.env.APPLE_ROOT_CERTS_BASE64 || "";

  const roots = base64
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const raw = Buffer.from(s, "base64");
      new X509Certificate(raw);
      return raw;
    });

  if (!roots.length) {
    throw new Error("Apple root certificates are missing");
  }

  return roots;
}

// アプリごとのBundle IDを設定
function getAppConfigs() {
  const configs = [];

  const manzaiBundle =
    process.env.APPLE_MANZAI_BUNDLE_ID || "";

  const manzaiAppId =
    Number(process.env.APPLE_MANZAI_APP_ID);

  if (manzaiBundle) {
    configs.push({
      mode: "manzai",
      bundleId: manzaiBundle,
      appId: manzaiAppId
    });
  }

  // 旧環境変数をコントメーカー用として維持
  const conteBundle =
    process.env.APPLE_CONTE_BUNDLE_ID ||
    process.env.APPLE_BUNDLE_ID ||
    "";

  const conteAppId = Number(
    process.env.APPLE_CONTE_APP_ID ||
    process.env.APPLE_APP_ID
  );

  if (conteBundle) {
    configs.push({
      mode: "conte",
      bundleId: conteBundle,
      appId: conteAppId
    });
  }

  if (!configs.length) {
    throw new Error("Apple app configuration is missing");
  }

  // 同じBundle IDを2アプリとして登録させない
  const bundleIds = configs.map(c => c.bundleId);

  if (new Set(bundleIds).size !== bundleIds.length) {
    throw new Error("Duplicate Apple bundle configuration");
  }

  return configs;
}

function createVerifier(environment, app, roots) {
  if (
    !app.bundleId ||
    (
      environment === Environment.PRODUCTION &&
      (
        !Number.isSafeInteger(app.appId) ||
        app.appId <= 0
      )
    )
  ) {
    throw new Error(
      "App Store verifier configuration is incomplete"
    );
  }

  return new SignedDataVerifier(
    roots,
    true,
    environment,
    app.bundleId,
    environment === Environment.PRODUCTION
      ? app.appId
      : undefined
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  const {
    signed_transaction,
    user_id,
    app_account_token
  } = req.body || {};

  // 入力チェック
  if (
    typeof signed_transaction !== "string" ||
    signed_transaction.length > 30000 ||
    signed_transaction.split(".").length !== 3 ||
    typeof user_id !== "string" ||
    !user_id.trim() ||
    user_id.length > 200 ||
    !UUID_REGEX.test(String(app_account_token || ""))
  ) {
    return res.status(400).json({
      error: "Invalid purchase request"
    });
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return res.status(503).json({
      error: "Database not configured"
    });
  }

  let decoded = null;
  let verifiedApp = null;
  let verifiedEnvironment = null;

  try {
    const roots = getAppleRoots();
    const apps = getAppConfigs();

    // 署名済みの購入情報を各アプリ・環境で検証。
    // 申告されたアプリ種別は信用しない。
    for (const app of apps) {
      if (decoded) break;

      for (const env of [
        Environment.PRODUCTION,
        Environment.SANDBOX
      ]) {
        try {
          const verifier = createVerifier(
            env,
            app,
            roots
          );

          const payload =
            await verifier.verifyAndDecodeTransaction(
              signed_transaction
            );

          decoded = payload;
          verifiedApp = app;
          verifiedEnvironment = env;

          console.info(
            "[IAP] Apple signature verification succeeded",
            {
              mode: app.mode,
              environment: env
            }
          );

          break;
        } catch (err) {
          console.warn(
            "[IAP] Apple signature verification failed",
            {
              mode: app.mode,
              environment: env,
              name: err?.name || "Error",
              message: err?.message || String(err),
              code: err?.code ?? null,
              status: err?.status ?? null
            }
          );
        }
      }
    }

    if (!decoded || !verifiedApp) {
      return res.status(422).json({
        error: "Apple signature verification failed"
      });
    }

    // Apple署名付きペイロードの属性を検証
    if (
      decoded.productId !== PRODUCT ||
      decoded.type !== "Non-Consumable" ||
      String(decoded.appAccountToken || "").toLowerCase() !==
        app_account_token.toLowerCase() ||
      decoded.revocationDate != null ||
      !decoded.transactionId ||
      decoded.bundleId !== verifiedApp.bundleId ||
      (
        decoded.quantity != null &&
        Number(decoded.quantity) !== 1
      )
    ) {
      return res.status(422).json({
        error: "Purchase attributes mismatch"
      });
    }

    // 署名検証に成功したアプリに基づいてIDを分離
    const rawId = user_id.trim();

    if (
      verifiedApp.mode === "manzai" &&
      rawId.startsWith("conte_")
    ) {
      return res.status(400).json({
        error: "Invalid manzai user ID"
      });
    }

    const scopedId =
      verifiedApp.mode === "conte"
        ? (
            rawId.startsWith("conte_")
              ? rawId
              : `conte_${rawId}`
          )
        : rawId;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    // 検証済み取引のみDBに適用
    const { data, error } = await supabase.rpc(
      "apply_verified_apple_unlock",
      {
        p_user_id: scopedId,
        p_transaction_id: String(decoded.transactionId),
        p_product_id: PRODUCT,
        p_app_account_token:
          String(decoded.appAccountToken).toLowerCase(),
        p_environment: String(verifiedEnvironment)
      }
    );

    if (error) {
      console.error("[IAP] purchase RPC failed", error);

      return res.status(503).json({
        error: "Credit delivery temporarily unavailable"
      });
    }

    const result = Array.isArray(data)
      ? data[0]
      : data;

    if (result?.status === "conflict") {
      return res.status(409).json({
        error: "Transaction already belongs to another account"
      });
    }

    if (
      result?.status !== "credited" &&
      result?.status !== "duplicate"
    ) {
      return res.status(503).json({
        error: "Unexpected purchase delivery result"
      });
    }

    return res.status(200).json({
      ok: true,
      mode: verifiedApp.mode,
      granted: result.status === "credited",
      already_processed: result.status === "duplicate",
      paid_credits: result.paid_credits,
      unlimited: true
    });

  } catch (err) {
    console.error("[IAP] verification unavailable", {
      name: err?.name || "Error",
      message: err?.message || String(err)
    });

    return res.status(503).json({
      error: "Purchase verification unavailable"
    });
  }
}
