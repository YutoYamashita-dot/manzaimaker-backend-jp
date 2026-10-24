
// POST /api/iap/verify
// StoreKit 2 の署名付き購入情報をAppleの証明書で検証する。
// Appleの署名検証失敗時はVercel Logsに詳細を記録する。
// 注意：user_idは認証済みアカウントではなく従来の端末識別子。

export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import {
  SignedDataVerifier,
  Environment
} from "@apple/app-store-server-library";
import { X509Certificate } from "node:crypto";

const PRODUCT = "unlimited_unlock";
const UNLIMITED = 999999;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Appleのルート証明書と環境変数から署名検証器を作成する。
function createVerifier(environment) {
  const base64 = process.env.APPLE_ROOT_CERTS_BASE64 || "";

  const roots = base64
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const raw = Buffer.from(s, "base64");

      // 証明書の形式が不正な場合はエラーにする。
      new X509Certificate(raw);

      return raw;
    });

  const bundle = process.env.APPLE_BUNDLE_ID || "";
  const appId = Number(process.env.APPLE_APP_ID);

  if (
    !roots.length ||
    !bundle ||
    (
      environment === Environment.PRODUCTION &&
      (!Number.isSafeInteger(appId) || appId <= 0)
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
    bundle,
    environment === Environment.PRODUCTION
      ? appId
      : undefined
  );
}

export default async function handler(req, res) {

  // POSTのみ許可
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

  // リクエスト形式の検証
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

  // Supabase接続設定を確認
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return res.status(503).json({
      error: "Database not configured"
    });
  }

  let decoded;

  try {

    // Appleによる署名検証。
    // クライアントが申告した環境を信用せず、
    // ProductionとSandboxの両方で検証する。
    const environments = [
      Environment.PRODUCTION,
      Environment.SANDBOX
    ];

    for (const env of environments) {
      try {

        const payload = await createVerifier(env)
          .verifyAndDecodeTransaction(signed_transaction);

        decoded = payload;

        // 検証成功をログに出す
        console.info(
          "[IAP] Apple signature verification succeeded",
          { environment: env }
        );

        break;

      } catch (err) {

        // ★今回追加した診断処理
        // 秘密鍵・購入情報そのものはログに出さない。
        console.error(
          "[IAP] Apple signature verification failed",
          {
            environment: env,
            name: err?.name || "Error",
            message: err?.message || String(err),
            code: err?.code ?? null,
            status: err?.status ?? null
          }
        );

      }
    }

    // どちらの環境でも検証できなかった場合
    if (!decoded) {
      return res.status(422).json({
        error: "Apple signature verification failed"
      });
    }

    // 商品ID・購入種類・購入者トークンなどを照合する。
    if (
      decoded.productId !== PRODUCT ||
      decoded.type !== "Non-Consumable" ||
      String(decoded.appAccountToken || "").toLowerCase() !==
        app_account_token.toLowerCase() ||
      decoded.revocationDate != null ||
      !decoded.transactionId ||
      decoded.bundleId !== process.env.APPLE_BUNDLE_ID ||
      (
        decoded.quantity != null &&
        decoded.quantity !== 1
      )
    ) {
      return res.status(422).json({
        error: "Purchase attributes mismatch"
      });
    }

    // 既存のユーザー識別子形式を維持
    const scopedId = user_id.startsWith("conte_")
      ? user_id
      : `conte_${user_id}`;

    // Supabaseに接続
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

    // 検証済みの購入情報を記録し、
    // コントの無制限生成を有効化する。
    const { data, error } = await supabase.rpc(
      "apply_verified_apple_unlock",
      {
        p_user_id: scopedId,
        p_transaction_id: String(decoded.transactionId),
        p_product_id: PRODUCT,
        p_app_account_token:
          String(decoded.appAccountToken).toLowerCase(),
        p_environment: String(decoded.environment || "")
      }
    );

    if (error) {
      console.error(
        "purchase credit rpc failed",
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

    // 購入検証・権限反映が正常に完了
    return res.status(200).json({
      ok: true,
      granted: result?.status === "credited",
      already_processed: result?.status === "duplicate",
      paid_credits: result?.paid_credits,
      unlimited: true
    });

  } catch (err) {

    console.error(
      "iap verification failed",
      err
    );

    return res.status(503).json({
      error: "Purchase verification unavailable"
    });

  }
}
