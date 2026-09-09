// PATH IN YOUR REPO: artifacts/api-server/src/routes/submit.ts
//
// POST /api/submit  body: { name, email, instagram, series, credits, story, issue }

import { Router } from "express";
import { publicLimiter } from "../middleware/rateLimit";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { submissions } from "@workspace/db/schema";
import { sendDiscordWebhook } from "../lib/discordWebhook";

const router = Router();

router.post("/submit", publicLimiter, async (req, res) => {
  try {
    const { name, email, instagram, series, credits, story, issue, files } = req.body ?? {};

    if (
      !name || typeof name !== "string" ||
      !email || typeof email !== "string" || !email.includes("@") ||
      !series || typeof series !== "string" ||
      !credits || typeof credits !== "string" ||
      !Array.isArray(files) || files.length < 6 || files.length > 20 ||
      !files.every((f: unknown) => typeof f === "string" && f.length > 0)
    ) {
      return res.status(400).json({ error: "Please fill in all required fields and include 6 to 20 images." });
    }

    const cleanName = name.trim();
    const cleanSeries = series.trim();
    const cleanIssue = typeof issue === "string" ? issue.trim() : "Issue 01 — The First Gaze";

    const submissionId = randomUUID();

    await db.insert(submissions).values({
      id: submissionId,
      name: cleanName,
      email: email.trim().toLowerCase(),
      instagram: typeof instagram === "string" ? instagram.trim() : null,
      series: cleanSeries,
      credits: credits.trim(),
      story: typeof story === "string" ? story.trim() : null,
      issue: cleanIssue,
      status: "received",
      isRead: false,
      rating: 0,
      files,
    });

    sendDiscordWebhook(process.env.SUBMISSIONS_WEBHOOK, {
      title: `📸 New Submission — ${cleanSeries}`,
      color: 0xd4af37,
      fields: [
        { name: "👤 Photographer", value: cleanName, inline: true },
        { name: "📧 Email", value: email.trim().toLowerCase(), inline: true },
        { name: "📸 Instagram", value: typeof instagram === "string" && instagram.trim() ? instagram.trim() : "Not provided", inline: true },
        { name: "📖 Issue", value: cleanIssue, inline: true },
        { name: "🆔 Submission ID", value: submissionId, inline: false },
        { name: "🖼️ Images", value: `${files.length} file(s)`, inline: true },
        { name: "🎬 Team Credits", value: credits.trim(), inline: false },
        { name: "✍️ Story", value: typeof story === "string" && story.trim() ? story.trim().slice(0, 1000) : "Not provided", inline: false },
      ],
      footer: { text: "Submitted via revelemagazine.com — Revele Submissions System" },
      timestamp: new Date().toISOString(),
    });

    res.json({ message: "Your submission has been received." });
  } catch (err) {
    console.error("Error saving submission:", err);
    res.status(500).json({ error: "Submission failed. Please try again." });
  }
});

export default router;
