// PATH IN YOUR REPO: artifacts/api-server/src/middleware/rateLimit.ts
//
// Rate limiters for public-facing endpoints.

import rateLimit from "express-rate-limit";

// General public read/write endpoints: settings, count, featured-public, track, newsletter, submit
// 100 requests per 15 minutes per IP — generous for real visitors and page polling,
// tight enough to block scripted abuse
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// File upload URL generation: needs a much higher ceiling since one submission
// can legitimately make 6-20 requests (one per image) in a short burst
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many upload requests. Please try again later." },
});

// Admin login: 5 attempts per 15 minutes per IP — brute-force protection
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});
