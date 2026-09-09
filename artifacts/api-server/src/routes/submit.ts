// PATH IN YOUR REPO: artifacts/api-server/src/routes/submit.ts
//
// POST /api/submit  body: { name, email, instagram, series, credits, story, issue }

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { submissions } from "@workspace/db/schema";
import { sendDiscordWebhook } from "../lib/discordWebhook";

const router = Router();

router.post("/submit", async (req, res) => {
  try {
    const { name, email, instagram, series, credits, story, issue } = req.body ?? {};

    if (
      !name || typeof name !== "string" ||
      !email || typeof email !== "string" || !email.includes("@") ||
      !series || typeof series !== "string" ||
      !credits || typeof credits !== "string"
    ) {
      return res.status(400).json({ error: "Please fill in all required fields." });
    }

    const cleanName = name.trim();
    const cleanSeries = series.trim();
    const cleanIssue = typeof issue === "string" ? issue.trim() : "Issue 01 — The First Gaze";

    await db.insert(submissions).values({
      id: randomUUID(),
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
    });

    sendDiscordWebhook(
      process.env.SUBMISSIONS_WEBHOOK,
      `📸 New submission — **${cleanName}**\nSeries: "${cleanSeries}"\nIssue: ${cleanIssue}`
    );

    res.json({ message: "Your submission has been received." });
  } catch (err) {
    console.error("Error saving submission:", err);
    res.status(500).json({ error: "Submission failed. Please try again." });
  }
});

export default router;
