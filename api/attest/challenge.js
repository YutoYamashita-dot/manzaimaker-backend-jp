
 // api/attest/challenge.js

export const config = { runtime: "nodejs" };

import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// チャレンジの有効期限：5分
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

export default async function handler(req, res) {

  // POSTのみ許可
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  // 保存・キャッシュを禁止
  res.setHeader("Cache-Control", "no-store");

  const supabaseURL = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseURL || !supabaseKey) {
    console.error(
      "[AppAttest] Supabase configuration missing"
    );

    return res.status(503).json({
      error: "Database not configured"
    });
  }

  try {

    // 暗号学的に安全な32バイトの乱数
    const challengeBytes = randomBytes(32);

    // Swift側へBase64で返す
    const challenge = challengeBytes.toString("base64");

    // チャレンジ識別子
    const challengeId = randomUUID();

    const expiresAt = new Date(
      Date.now() + CHALLENGE_LIFETIME_MS
    ).toISOString();

    const supabase = createClient(
      supabaseURL,
      supabaseKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    // Supabaseへ保存
    const { error } = await supabase
      .from("app_attest_challenges")
      .insert({
        id: challengeId,
        challenge: challenge,
        expires_at: expiresAt
      });

    if (error) {
      console.error(
        "[AppAttest] Challenge insert failed",
        error
      );

      return res.status(503).json({
        error: "Challenge storage unavailable"
      });
    }

    console.info(
      "[AppAttest] Challenge created",
      { challengeId }
    );

    return res.status(200).json({
      ok: true,
      challenge_id: challengeId,
      challenge: challenge,
      expires_at: expiresAt
    });

  } catch (err) {

    console.error(
      "[AppAttest] Challenge creation failed",
      {
        name: err?.name || "Error",
        message: err?.message || String(err)
      }
    );

    return res.status(503).json({
      error: "Challenge generation unavailable"
    });
  }
}
