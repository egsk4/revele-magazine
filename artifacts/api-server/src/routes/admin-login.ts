// PATH IN YOUR REPO: artifacts/api-server/src/routes/admin-login.ts
//
// POST /api/admin/login  body: { "password": "..." } -> { token, loginTime }

import { Router } from "express";
import { loginLimiter } from "../middleware/rateLimit";
import { timingSafeEqual } from "crypto";
import { signAdminToken } from "../lib/adminAuth";

const router = Router();

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

router.post("/admin/login", loginLimiter, (req, res) => {
  const { password } = req.body ?? {};
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error("ADMIN_PASSWORD is not set on the server");
    return res.status(500).json({ error: "Admin login is not configured" });
  }

  if (typeof password !== "string" || !safeCompare(password, adminPassword)) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  const token = signAdminToken();
  res.json({ token, loginTime: new Date().toISOString() });
});

export default router;
