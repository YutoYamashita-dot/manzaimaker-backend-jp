
// api/attest/verifyAssertion.js

import { createClient } from "@supabase/supabase-js";
import { verifyAssertion } from "node-app-attest";

const MAX_ASSERTION_LENGTH = 30000;
const MAX_CLIENT_DATA_LENGTH = 40000;

function errorWithStatus(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function decodeBase64(value, maxLength) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw errorWithStatus("Invalid App Attest encoding", 400);
  }

  const result = Buffer.from(value, "base64");

  if (
    result.length === 0 ||
    result.toString("base64") !== value
  ) {
    throw errorWithStatus("Invalid App Attest data", 400);
  }

  return result;
}

function normalizeJSON(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeJSON);
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const key of Object.keys(value).sort()) {
      result[key] = normalizeJSON(value[key]);
    }

    return result;
  }

  return value;
}

function sameJSON(a, b) {
  return JSON.stringify(normalizeJSON(a)) ===
    JSON.stringify(normalizeJSON(b));
}

export async function verifyManzaiAssertion(
  requestBody,
  attestation
) {
  const teamIdentifier =
    String(process.env.APP_ATTEST_TEAM_ID || "").trim();

  const bundleIdentifier =
    String(process.env.APPLE_MANZAI_BUNDLE_ID || "").trim();

  if (!teamIdentifier || !bundleIdentifier) {
    throw errorWithStatus(
      "App Attest configuration missing",
      503
    );
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw errorWithStatus(
      "Supabase configuration missing",
      503
    );
  }

  const {
    key_id,
    challenge_id,
    assertion,
    client_data
  } = attestation || {};

  if (
    typeof key_id !== "string" ||
    key_id.length < 20 ||
    key_id.length > 300 ||
    typeof challenge_id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(challenge_id)
  ) {
    throw errorWithStatus("Invalid App Attest request", 400);
  }

  const assertionBytes = decodeBase64(
    assertion,
    MAX_ASSERTION_LENGTH
  );

  const clientDataBytes = decodeBase64(
    client_data,
    MAX_CLIENT_DATA_LENGTH
  );

  let signedPayload;

  try {
    signedPayload = JSON.parse(
      clientDataBytes.toString("utf8")
    );
  } catch {
    throw errorWithStatus("Invalid signed payload", 400);
  }

  if (
    !signedPayload ||
    typeof signedPayload !== "object" ||
    Array.isArray(signedPayload) ||
    typeof signedPayload.challenge !== "string" ||
    !signedPayload.request ||
    typeof signedPayload.request !== "object" ||
    Array.isArray(signedPayload.request)
  ) {
    throw errorWithStatus("Invalid signed structure", 400);
  }

  // 署名されていない生成条件への差し替えを禁止
  const unsignedRequest = { ...requestBody };
  delete unsignedRequest.app_attest;

  if (!sameJSON(signedPayload.request, unsignedRequest)) {
    throw errorWithStatus(
      "Signed request does not match generated request"
    );
  }

  // この検証関数は漫才生成専用
  if (
    signedPayload.request.action !== "generate" ||
    signedPayload.request.mode !== "manzai"
  ) {
    throw errorWithStatus(
      "Invalid signed generation mode"
    );
  }

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

  // 使い捨てチャレンジを原子的に消費
  const { data: challengeBase64, error: challengeError } =
    await supabase.rpc("consume_app_attest_challenge", {
      p_challenge_id: challenge_id
    });

  if (challengeError) {
    throw errorWithStatus(
      "App Attest challenge service unavailable",
      503
    );
  }

  if (
    typeof challengeBase64 !== "string" ||
    !challengeBase64 ||
    signedPayload.challenge !== challengeBase64
  ) {
    throw errorWithStatus(
      "App Attest challenge expired or invalid"
    );
  }

  // 初回Attestationで登録した公開鍵を取得
  const { data: keyRow, error: keyError } =
    await supabase
      .from("app_attest_keys")
      .select("public_key, sign_count, bundle_id")
      .eq("key_id", key_id)
      .maybeSingle();

  if (keyError) {
    throw errorWithStatus(
      "App Attest key lookup unavailable",
      503
    );
  }

  if (
    !keyRow ||
    keyRow.bundle_id !== bundleIdentifier ||
    typeof keyRow.public_key !== "string"
  ) {
    throw errorWithStatus("Unregistered App Attest key");
  }

  const oldCount = Number(keyRow.sign_count);

  if (
    !Number.isSafeInteger(oldCount) ||
    oldCount < 0
  ) {
    throw errorWithStatus(
      "Invalid stored signature counter",
      503
    );
  }

  let verificationResult;

  try {
    verificationResult = verifyAssertion({
      assertion: assertionBytes,
      payload: clientDataBytes,
      publicKey: keyRow.public_key,
      bundleIdentifier,
      teamIdentifier,
      signCount: oldCount
    });
  } catch (err) {
    console.warn(
      "[AppAttest] Assertion rejected:",
      err?.message || String(err)
    );

    throw errorWithStatus(
      "Apple App Attest assertion verification failed"
    );
  }

  const newCount = Number(
    verificationResult?.signCount
  );

  if (
    !Number.isSafeInteger(newCount) ||
    newCount <= oldCount
  ) {
    throw errorWithStatus(
      "Invalid App Attest signature counter"
    );
  }

  // 同時実行でもカウンターを巻き戻さない
  const { data: updated, error: counterError } =
    await supabase.rpc("advance_app_attest_counter", {
      p_key_id: key_id,
      p_old_count: oldCount,
      p_new_count: newCount,
      p_bundle_id: bundleIdentifier
    });

  if (counterError) {
    throw errorWithStatus(
      "Signature counter update unavailable",
      503
    );
  }

  if (updated !== true) {
    throw errorWithStatus(
      "Assertion replay or concurrent counter conflict"
    );
  }

  return {
    verified: true,
    app: "manzai_ios",
    signCount: newCount
  };
}
