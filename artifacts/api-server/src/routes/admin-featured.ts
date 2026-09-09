// PATH IN YOUR REPO: artifacts/api-server/src/routes/admin-featured.ts
//
// Admin CRUD for the Featured Editor. All routes require "Authorization: Bearer <token>".

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { featured } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

router.get("/admin/featured", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(featured).orderBy(asc(featured.sortOrder), asc(featured.createdAt));
    res.json({ featured: rows });
  } catch (err) {
    console.error("Error loading admin featured:", err);
    res.status(500).json({ error: "Failed to load featured entries" });
  }
});

router.post("/admin/featured", requireAdmin, async (req, res) => {
  try {
    const { series, photographer, instagram, issue, credits, story, status } = req.body ?? {};
    if (!series || !photographer || !credits || !story) {
      return res.status(400).json({ error: "Please fill in all required fields." });
    }

    await db.insert(featured).values({
      id: randomUUID(),
      series: String(series).trim(),
      photographer: String(photographer).trim(),
      instagram: typeof instagram === "string" ? instagram.trim() : null,
      issue: typeof issue === "string" ? issue.trim() : "Issue 01",
      credits: String(credits).trim(),
      story: String(story).trim(),
      status: status === "published" ? "published" : "draft",
      sortOrder: 0,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error creating featured entry:", err);
    res.status(500).json({ error: "Failed to save entry" });
  }
});

router.patch("/admin/featured/:id", requireAdmin, async (req, res) => {
  try {
    const { status, series, photographer, instagram, issue, credits, story, sortOrder } = req.body ?? {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (series !== undefined) updates.series = series;
    if (photographer !== undefined) updates.photographer = photographer;
    if (instagram !== undefined) updates.instagram = instagram;
    if (issue !== undefined) updates.issue = issue;
    if (credits !== undefined) updates.credits = credits;
    if (story !== undefined) updates.story = story;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    await db.update(featured).set(updates).where(eq(featured.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating featured entry:", err);
    res.status(500).json({ error: "Failed to update entry" });
  }
});

router.delete("/admin/featured/:id", requireAdmin, async (req, res) => {
  try {
    await db.delete(featured).where(eq(featured.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting featured entry:", err);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

export default router;
