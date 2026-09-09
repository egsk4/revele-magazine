// PATH IN YOUR REPO: artifacts/api-server/src/lib/adminAuth.ts
//
// Minimal signed-token auth for the single admin user. No extra
// dependencies needed. Token = base64url(payload) + "." + HMAC-SHA256 signature,
// signed with ADMIN_PASSWORD as the secret.

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret(): string {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_PASSWORD is not set");
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export function signAdminToken(): string {
  const payload = JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS });
  const encodedPayload = base64url(payload);
  const sig = createHmac("sha256", getSecret()).update(encodedPayload).digest();
  return `${encodedPayload}.${base64url(sig)}`;
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [encodedPayload, encodedSig] = token.split(".");
  if (!encodedPayload || !encodedSig) return false;

  const expectedSig = createHmac("sha256", getSecret()).update(encodedPayload).digest();
  const actualSig = base64urlDecode(encodedSig);
  if (expectedSig.length !== actualSig.length) return false;
  if (!timingSafeEqual(expectedSig, actualSig)) return false;

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload).toString());
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}
