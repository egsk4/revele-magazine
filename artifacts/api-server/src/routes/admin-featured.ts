// PATH IN YOUR REPO: artifacts/api-server/src/routes/admin-featured.ts
//
// Admin CRUD for the Featured Editor. All routes require "Authorization: Bearer <token>".

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { featured } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { randomUUID as uuid4 } from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "../lib/r2";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FEATURED_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB

const router = Router();

router.get("/admin/featured", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(featured).orderBy(asc(featured.sortOrder), asc(featured.createdAt));
    const withUrls = await Promise.all(rows.map(async (row) => ({
      ...row,
      imageUrls: await Promise.all((row.images || []).map(async (key) => {
        const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
        const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
        return { key, url };
      })),
    })));
    res.json({ featured: withUrls });
  } catch (err) {
    console.error("Error loading admin featured:", err);
    res.status(500).json({ error: "Failed to load featured entries" });
  }
});

router.post("/admin/featured", requireAdmin, async (req, res) => {
  try {
    const { series, photographer, instagram, issue, credits, story, status, images } = req.body ?? {};
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
      images: Array.isArray(images) ? images : [],
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
    const { status, series, photographer, instagram, issue, credits, story, sortOrder, images } = req.body ?? {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (series !== undefined) updates.series = series;
    if (photographer !== undefined) updates.photographer = photographer;
    if (instagram !== undefined) updates.instagram = instagram;
    if (issue !== undefined) updates.issue = issue;
    if (credits !== undefined) updates.credits = credits;
    if (story !== undefined) updates.story = story;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (images !== undefined) updates.images = images;

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

router.post("/admin/featured/upload-url", requireAdmin, async (req, res) => {
  try {
    const { filename, contentType, fileSize } = req.body ?? {};
    if (!filename || typeof filename !== "string") return res.status(400).json({ error: "filename is required" });
    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) return res.status(400).json({ error: "File must be JPG, PNG, or WEBP" });
    if (typeof fileSize !== "number" || fileSize <= 0) return res.status(400).json({ error: "fileSize is required" });
    if (fileSize > MAX_FEATURED_IMAGE_SIZE) return res.status(400).json({ error: "File exceeds 50MB limit" });

    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    const fileKey = `featured/${uuid4()}.${ext}`;
    const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: fileKey, ContentType: contentType });
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 });
    res.json({ uploadUrl, fileKey });
  } catch (err) {
    console.error("Error generating featured upload URL:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

export default router;
