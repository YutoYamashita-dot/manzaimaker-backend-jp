
// api/attest/register.js

export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { verifyAttestation } from "node-app-attest";

const MAX_ATTESTATION_BASE64_LENGTH = 100000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function getAppConfiguration() {
  const teamIdentifier =
    String(process.env.APP_ATTEST_TEAM_ID || "").trim();

  const bundleIdentifier =
    String(process.env.APPLE_MANZAI_BUNDLE_ID || "").trim();

  if (!/^[A-Z0-9]{10}$/.test(teamIdentifier)) {
    throw new Error("APP_ATTEST_TEAM_ID is invalid");
  }

  if (!bundleIdentifier) {
    throw new Error("APPLE_MANZAI_BUNDLE_ID is missing");
  }

  return {
    teamIdentifier,
    bundleIdentifier,
    allowDevelopmentEnvironment:
      process.env.APP_ATTEST_ALLOW_DEVELOPMENT === "true"
  };
}

function decodeBase64(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_ATTESTATION_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value) ||
    value.length % 4 !== 0
  ) {
    throw new Error("Invalid base64 data");
  }

  const decoded = Buffer.from(value, "base64");

  if (
    decoded.length === 0 ||
    decoded.toString("base64") !== value
  ) {
    throw new Error("Malformed base64 data");
  }

  return decoded;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  const {
    challenge_id,
    key_id,
    attestation
  } = req.body || {};

  if (
    typeof challenge_id !== "string" ||
    !UUID_PATTERN.test(challenge_id) ||
    typeof key_id !== "string" ||
    key_id.length < 20 ||
    key_id.length > 300 ||
    typeof attestation !== "string" ||
    attestation.length > MAX_ATTESTATION_BASE64_LENGTH
  ) {
    return res.status(400).json({
      ok: false,
      error: "Invalid registration request"
    });
  }

  let supabase;
  let configuration;

  try {
    supabase = createSupabase();
    configuration = getAppConfiguration();
  } catch (err) {
    console.error(
      "[AppAttest] Registration configuration error",
      err?.message
    );

    return res.status(503).json({
      ok: false,
      error: "Attestation service not configured"
    });
  }

  let attestationBuffer;

  try {
    attestationBuffer = decodeBase64(attestation);
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: "Invalid attestation encoding"
    });
  }

  // 1. 使い捨てチャレンジを原子的に消費
  const { data: challengeBase64, error: claimError } =
    await supabase.rpc("consume_app_attest_challenge", {
      p_challenge_id: challenge_id
    });

  if (claimError) {
    console.error(
      "[AppAttest] Challenge claim error",
      claimError
    );

    return res.status(503).json({
      ok: false,
      error: "Challenge storage unavailable"
    });
  }

  if (
    typeof challengeBase64 !== "string" ||
    !challengeBase64
  ) {
    return res.status(422).json({
      ok: false,
      error: "Challenge expired or already used"
    });
  }

  // 2. チャレンジの生バイト列を取り出す
  let challengeBytes;

  try {
    challengeBytes = Buffer.from(
      challengeBase64,
      "base64"
    );

    if (challengeBytes.length !== 32) {
      throw new Error("Unexpected challenge size");
    }
  } catch (err) {
    return res.status(503).json({
      ok: false,
      error: "Stored challenge invalid"
    });
  }

  // 3. Apple App Attestの証明を検証
  let verified;

  try {
    verified = verifyAttestation({
      attestation: attestationBuffer,
      challenge: challengeBytes,
      keyId: key_id,
      bundleIdentifier: configuration.bundleIdentifier,
      teamIdentifier: configuration.teamIdentifier,
      allowDevelopmentEnvironment:
        configuration.allowDevelopmentEnvironment
    });

    if (
      !verified ||
      verified.keyId !== key_id ||
      typeof verified.publicKey !== "string" ||
      !verified.publicKey
    ) {
      throw new Error("Incomplete attestation result");
    }

  } catch (err) {
    console.warn(
      "[AppAttest] Attestation rejected",
      {
        name: err?.name || "Error",
        message: err?.message || String(err)
      }
    );

    return res.status(422).json({
      ok: false,
      error: "Apple App Attest verification failed"
    });
  }

  // 4. 既存の登録済み鍵を確認
  const { data: existing, error: lookupError } =
    await supabase
      .from("app_attest_keys")
      .select("key_id, public_key, bundle_id")
      .eq("key_id", key_id)
      .maybeSingle();

  if (lookupError) {
    console.error(
      "[AppAttest] Key lookup error",
      lookupError
    );

    return res.status(503).json({
      ok: false,
      error: "Key storage unavailable"
    });
  }

  if (existing) {
    if (
      existing.public_key === verified.publicKey &&
      existing.bundle_id ===
        configuration.bundleIdentifier
    ) {
      return res.status(200).json({
        ok: true,
        registered: true,
        already_registered: true
      });
    }

    return res.status(409).json({
      ok: false,
      error: "App Attest key conflict"
    });
  }

  // 5. 検証済みの公開鍵をSupabaseへ保存
  const { error: insertError } =
    await supabase
      .from("app_attest_keys")
      .insert({
        key_id: key_id,
        public_key: verified.publicKey,
        sign_count: 0,
        bundle_id: configuration.bundleIdentifier,
        environment:
          configuration.allowDevelopmentEnvironment
            ? "development_allowed"
            : "production"
      });

  if (insertError) {
    console.error(
      "[AppAttest] Key registration failed",
      insertError
    );

    return res.status(503).json({
      ok: false,
      error: "Key registration unavailable"
    });
  }

  console.info(
    "[AppAttest] Key registered successfully",
    {
      bundleId: configuration.bundleIdentifier,
      keyIdPrefix: key_id.slice(0, 8)
    }
  );

  return res.status(200).json({
    ok: true,
    registered: true,
    already_registered: false
  });
}
