// PATH IN YOUR REPO: artifacts/api-server/src/middleware/requireAdmin.ts
//
// Protects admin routes. Expects "Authorization: Bearer <token>".

import type { Request, Response, NextFunction } from "express";
import { verifyAdminToken } from "../lib/adminAuth";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
