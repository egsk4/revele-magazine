// PATH IN YOUR REPO: artifacts/api-server/src/routes/admin-settings.ts
//
// PATCH /api/admin/settings  body: { deadline: ISOString }

import { Router } from "express";
import { db } from "@workspace/db";
import { settings } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();
const SETTINGS_ID = "main";

router.patch("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const { deadline } = req.body ?? {};
    if (!deadline || isNaN(new Date(deadline).getTime())) {
      return res.status(400).json({ error: "A valid deadline is required" });
    }
    const parsed = new Date(deadline);

    const existing = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
    if (existing.length === 0) {
      await db.insert(settings).values({ id: SETTINGS_ID, deadline: parsed });
    } else {
      await db.update(settings).set({ deadline: parsed }).where(eq(settings.id, SETTINGS_ID));
    }

    res.json({ success: true, deadline: parsed.toISOString() });
  } catch (err) {
    console.error("Error saving settings:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
