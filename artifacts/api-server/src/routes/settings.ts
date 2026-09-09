// PATH IN YOUR REPO: artifacts/api-server/src/routes/settings.ts
//
// GET /api/settings -> { deadline: ISOString | null }

import { Router } from "express";
import { db } from "@workspace/db";
import { settings } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();
const SETTINGS_ID = "main";

router.get("/settings", async (_req, res) => {
  try {
    const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
    const deadline = rows[0]?.deadline ?? null;
    res.json({ deadline: deadline ? new Date(deadline).toISOString() : null });
  } catch (err) {
    console.error("Error loading settings:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

export default router;
