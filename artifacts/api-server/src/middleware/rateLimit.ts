// PATH IN YOUR REPO: artifacts/api-server/src/middleware/rateLimit.ts
//
// Rate limiters for public-facing endpoints.

import rateLimit from "express-rate-limit";

// General public endpoints: newsletter, submit, settings, featured-public, track, count
// 30 requests per 15 minutes per IP — generous for real visitors, tight enough to block scripted abuse
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// Admin login: 5 attempts per 15 minutes per IP — brute-force protection
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});
