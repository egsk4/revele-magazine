// PATH IN YOUR REPO: artifacts/api-server/src/routes/admin-subs.ts
//
// Admin CRUD for submissions, stats, analytics, and CSV export.
// All routes require "Authorization: Bearer <token>".

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { submissions, featured } from "@workspace/db/schema";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "../lib/r2";

const router = Router();

const VALID_STATUSES = ["received", "reviewing", "shortlist", "accepted", "declined", "published"];

router.get("/admin/subs", requireAdmin, async (req, res) => {
  try {
    const { status, search, sort } = req.query as Record<string, string | undefined>;
    const conditions = [];
    if (status && VALID_STATUSES.includes(status)) conditions.push(eq(submissions.status, status));
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(submissions.name, term), ilike(submissions.email, term), ilike(submissions.series, term)));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy = sort === "oldest" ? asc(submissions.createdAt) : desc(submissions.createdAt);

    const rows = whereClause
      ? await db.select().from(submissions).where(whereClause).orderBy(orderBy)
      : await db.select().from(submissions).orderBy(orderBy);

    res.json({ submissions: rows });
  } catch (err) {
    console.error("Error loading admin submissions:", err);
    res.status(500).json({ error: "Failed to load submissions" });
  }
});

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({ status: submissions.status, count: sql<number>`count(*)` })
      .from(submissions)
      .groupBy(submissions.status);

    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const n = Number(row.count);
      counts[row.status ?? "received"] = n;
      total += n;
    }

    res.json({
      total,
      received: counts.received ?? 0,
      reviewing: counts.reviewing ?? 0,
      shortlist: counts.shortlist ?? 0,
      accepted: counts.accepted ?? 0,
      declined: counts.declined ?? 0,
      published: counts.published ?? 0,
    });
  } catch (err) {
    console.error("Error loading admin stats:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

router.get("/admin/analytics", requireAdmin, async (_req, res) => {
  try {
    const dailyRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${submissions.createdAt}), 'YYYY-MM-DD')`,
        total: sql<number>`count(*)`,
      })
      .from(submissions)
      .where(sql`${submissions.createdAt} >= now() - interval '60 days'`)
      .groupBy(sql`date_trunc('day', ${submissions.createdAt})`)
      .orderBy(sql`date_trunc('day', ${submissions.createdAt}) asc`);

    const statusRows = await db
      .select({ status: submissions.status, count: sql<number>`count(*)` })
      .from(submissions)
      .groupBy(submissions.status);

    const byStatus: Record<string, number> = {};
    for (const row of statusRows) byStatus[row.status ?? "received"] = Number(row.count);

    res.json({
      daily: dailyRows.map((r) => ({ day: r.day, total: Number(r.total) })),
      byStatus,
    });
  } catch (err) {
    console.error("Error loading analytics:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

router.get("/admin/export", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(submissions).orderBy(desc(submissions.createdAt));
    const headers = ["id", "name", "email", "instagram", "series", "issue", "status", "rating", "createdAt"];
    const escapeCsv = (val: unknown) => {
      const s = val === null || val === undefined ? "" : String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvLines = [headers.join(","), ...rows.map((r) => headers.map((h) => escapeCsv((r as any)[h])).join(","))];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="revele-submissions.csv"`);
    res.send(csvLines.join("\n"));
  } catch (err) {
    console.error("Error exporting submissions:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

router.patch("/admin/subs/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!status || !VALID_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });
    await db.update(submissions).set({ status, updatedAt: new Date() }).where(eq(submissions.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.patch("/admin/subs/:id/read", requireAdmin, async (req, res) => {
  try {
    const { isRead } = req.body ?? {};
    await db.update(submissions).set({ isRead: Boolean(isRead), updatedAt: new Date() }).where(eq(submissions.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating read state:", err);
    res.status(500).json({ error: "Failed to update" });
  }
});

router.patch("/admin/subs/:id/notes", requireAdmin, async (req, res) => {
  try {
    const { notes } = req.body ?? {};
    await db.update(submissions).set({ notes: typeof notes === "string" ? notes : "", updatedAt: new Date() }).where(eq(submissions.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving notes:", err);
    res.status(500).json({ error: "Failed to save notes" });
  }
});

router.patch("/admin/subs/:id/rating", requireAdmin, async (req, res) => {
  try {
    const { rating } = req.body ?? {};
    const n = Number(rating);
    if (!Number.isInteger(n) || n < 0 || n > 5) return res.status(400).json({ error: "Rating must be 0-5" });
    await db.update(submissions).set({ rating: n, updatedAt: new Date() }).where(eq(submissions.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving rating:", err);
    res.status(500).json({ error: "Failed to save rating" });
  }
});

router.delete("/admin/subs/:id", requireAdmin, async (req, res) => {
  try {
    await db.delete(submissions).where(eq(submissions.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting submission:", err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

router.post("/admin/subs/bulk", requireAdmin, async (req, res) => {
  try {
    const { ids, action, status } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No ids provided" });

    if (action === "delete") {
      await db.delete(submissions).where(inArray(submissions.id, ids));
    } else if (action === "status") {
      if (!status || !VALID_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });
      await db.update(submissions).set({ status, updatedAt: new Date() }).where(inArray(submissions.id, ids));
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error in bulk action:", err);
    res.status(500).json({ error: "Bulk action failed" });
  }
});

router.post("/admin/subs/:id/feature", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(submissions).where(eq(submissions.id, req.params.id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Submission not found" });
    const sub = rows[0];

    await db.insert(featured).values({
      id: randomUUID(),
      series: sub.series,
      photographer: sub.name,
      instagram: sub.instagram,
      issue: sub.issue,
      story: sub.story,
      credits: sub.credits,
      status: "draft",
      submissionId: sub.id,
      sortOrder: 0,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error promoting to featured:", err);
    res.status(500).json({ error: "Failed to add to featured" });
  }
});

router.get("/admin/subs/:id/files", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(submissions).where(eq(submissions.id, req.params.id)).limit(1);
    const sub = rows[0];
    if (!sub) return res.status(404).json({ error: "Submission not found" });
    const fileKeys = sub.files || [];
    const urls = await Promise.all(
      fileKeys.map(async (key) => {
        const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
        const url = await getSignedUrl(r2, command, { expiresIn: 600 });
        return { key, url };
      })
    );
    res.json({ files: urls });
  } catch (err) {
    console.error("Error generating file URLs:", err);
    res.status(500).json({ error: "Failed to load files" });
  }
});

export default router;
