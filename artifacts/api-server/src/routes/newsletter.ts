// PATH IN YOUR REPO: artifacts/api-server/src/routes/newsletter.ts
//
// Handles newsletter signups.
// POST /api/newsletter  body: { "email": "someone@example.com" } -> { "success": true }

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { newsletter } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendDiscordWebhook } from "../lib/discordWebhook";

const router = Router();

router.post("/newsletter", async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await db
      .select()
      .from(newsletter)
      .where(eq(newsletter.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ success: true, alreadySubscribed: true });
    }

    await db.insert(newsletter).values({
      id: randomUUID(),
      email: normalizedEmail,
    });

    sendDiscordWebhook(process.env.NEWSLETTER_WEBHOOK, `📧 New newsletter signup: **${normalizedEmail}**`);

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving newsletter signup:", err);
    res.status(500).json({ error: "Failed to save signup" });
  }
});

export default router;
