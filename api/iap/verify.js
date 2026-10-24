
 // api/iap/verify.js
// StoreKit 2 の署名付き購入情報をAppleの証明書で検証する。
// 漫才メーカー：manzai_unlimited_unlock
// コントメーカー：unlimited_unlock
// 購入権はアプリごとに独立して管理する。

export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

import {
  SignedDataVerifier,
  Environment
} from "@apple/app-store-server-library";

import { X509Certificate } from "node:crypto";

const MANZAI_PRODUCT = "manzai_unlimited_unlock";
const CONTE_PRODUCT = "unlimited_unlock";

const CONTE_BUNDLE_ID =
  "com.yutoyamashita.ConteMaker";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* =========================
 * Appleのルート証明書
 * ========================= */

function getAppleRoots() {
  const base64 =
    process.env.APPLE_ROOT_CERTS_BASE64 || "";

  const roots = base64
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const raw = Buffer.from(s, "base64");
      new X509Certificate(raw);
      return raw;
    });

  if (roots.length === 0) {
    throw new Error("Apple root certificates are missing");
  }

  return roots;
}

/* =========================
 * アプリ設定
 * ========================= */

function getAppConfigs() {
  const apps = [];

  // 漫才メーカー
  const manzaiBundle =
    process.env.APPLE_MANZAI_BUNDLE_ID || "";

  const manzaiAppId =
    Number(process.env.APPLE_MANZAI_APP_ID || 0);

  if (manzaiBundle) {
    apps.push({
      mode: "manzai",
      bundleId: manzaiBundle,
      appId: manzaiAppId,
      productId: MANZAI_PRODUCT
    });
  }

  // コントメーカー
  const conteBundle =
    process.env.APPLE_CONTE_BUNDLE_ID ||
    process.env.APPLE_BUNDLE_ID ||
    CONTE_BUNDLE_ID;

  const conteAppId = Number(
    process.env.APPLE_CONTE_APP_ID ||
    process.env.APPLE_APP_ID ||
    0
  );

  if (conteBundle !== CONTE_BUNDLE_ID) {
    throw new Error(
      "Conte bundle configuration mismatch"
    );
  }

  apps.push({
    mode: "conte",
    bundleId: conteBundle,
    appId: conteAppId,
    productId: CONTE_PRODUCT
  });

  if (
    new Set(apps.map(app => app.bundleId)).size !==
    apps.length
  ) {
    throw new Error(
      "Duplicate Apple bundle configuration"
    );
  }

  return apps;
}

/* =========================
 * Apple署名検証器
 * ========================= */

function createVerifier(environment, app, roots) {
  if (!app.bundleId) {
    throw new Error("Apple bundle ID is missing");
  }

  if (
    environment === Environment.PRODUCTION &&
    (
      !Number.isSafeInteger(app.appId) ||
      app.appId <= 0
    )
  ) {
    throw new Error(
      "Production Apple App ID is missing"
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

/* =========================
 * メイン処理
 * ========================= */

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

  // リクエスト形式を検証
  if (
    typeof signed_transaction !== "string" ||
    signed_transaction.length > 30000 ||
    signed_transaction.split(".").length !== 3 ||
    typeof user_id !== "string" ||
    !user_id.trim() ||
    user_id.length > 200 ||
    !UUID_REGEX.test(
      String(app_account_token || "")
    )
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

    /* =========================
     * Apple署名検証
     * ========================= */

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
              environment: env,
              bundleId: app.bundleId,
              productId: payload.productId
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

    /* =========================
     * 商品・購入属性の検証
     * ========================= */

    if (
      decoded.productId !== verifiedApp.productId ||
      decoded.type !== "Non-Consumable" ||
      String(
        decoded.appAccountToken || ""
      ).toLowerCase() !==
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

    /* =========================
     * ユーザーIDの分離
     * ========================= */

    const rawId = user_id.trim();

    let scopedId;

    if (verifiedApp.mode === "conte") {

      scopedId = rawId.startsWith("conte_")
        ? rawId
        : `conte_${rawId}`;

    } else {

      if (rawId.startsWith("conte_")) {
        return res.status(400).json({
          error: "Invalid Manzai user ID"
        });
      }

      scopedId = rawId;
    }

    /* =========================
     * Supabase接続
     * ========================= */

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

    /* =========================
     * 検証済み購入情報の記録
     * ========================= */

    const { data, error } = await supabase.rpc(
      "apply_verified_apple_unlock",
      {
        p_user_id: scopedId,
        p_transaction_id:
          String(decoded.transactionId),
        p_product_id: verifiedApp.productId,
        p_app_account_token:
          String(decoded.appAccountToken).toLowerCase(),
        p_environment: String(verifiedEnvironment),
        p_bundle_id: decoded.bundleId
      }
    );

    if (error) {

      console.error(
        "[IAP] purchase RPC failed",
        error
      );

      return res.status(503).json({
        error: "Credit delivery temporarily unavailable"
      });
    }

    const result = Array.isArray(data)
      ? data[0]
      : data;

    if (result?.status === "conflict") {
      return res.status(409).json({
        error:
          "Transaction already belongs to another account"
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
      bundle_id: verifiedApp.bundleId,
      product_id: verifiedApp.productId,
      granted: result.status === "credited",
      already_processed: result.status === "duplicate",
      paid_credits: result.paid_credits,
      unlimited: true
    });

  } catch (err) {

    console.error(
      "[IAP] verification unavailable",
      {
        name: err?.name || "Error",
        message: err?.message || String(err)
      }
    );

    return res.status(503).json({
      error: "Purchase verification unavailable"
    });
  }
}
