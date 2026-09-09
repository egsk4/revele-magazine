// PATH IN YOUR REPO: artifacts/api-server/src/routes/featured-public.ts
//
// GET /api/featured        -> { featured: [...] } (published only)
// GET /api/featured/:id    -> { item }

import { Router } from "express";
import { db } from "@workspace/db";
import { featured } from "@workspace/db/schema";
import { and, eq, asc } from "drizzle-orm";

const router = Router();

router.get("/featured", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(featured)
      .where(eq(featured.status, "published"))
      .orderBy(asc(featured.sortOrder), asc(featured.createdAt));

    res.json({ featured: rows });
  } catch (err) {
    console.error("Error loading featured:", err);
    res.status(500).json({ error: "Failed to load featured content" });
  }
});

router.get("/featured/:id", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(featured)
      .where(and(eq(featured.id, req.params.id), eq(featured.status, "published")))
      .limit(1);

    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ item: rows[0] });
  } catch (err) {
    console.error("Error loading featured item:", err);
    res.status(500).json({ error: "Failed to load feature" });
  }
});

export default router;
