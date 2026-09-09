// PATH IN YOUR REPO: artifacts/api-server/src/routes/newsletter.ts
//
// Handles newsletter signups.
// POST /api/newsletter  body: { "email": "someone@example.com" } -> { "success": true }

import { Router } from "express";
import { publicLimiter } from "../middleware/rateLimit";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { newsletter } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendDiscordWebhook } from "../lib/discordWebhook";

const router = Router();

router.post("/newsletter", publicLimiter, async (req, res) => {
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

    sendDiscordWebhook(process.env.NEWSLETTER_WEBHOOK, {
      title: "📬 New Newsletter Subscriber",
      color: 0xd4af37,
      fields: [
        { name: "📧 Email", value: normalizedEmail, inline: true },
        { name: "📅 Date", value: new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }), inline: true },
      ],
      footer: { text: "Newsletter signup — revelemagazine.com" },
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    // Postgres unique_violation - another concurrent request already inserted this email
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return res.json({ success: true, alreadySubscribed: true });
    }
    console.error("Error saving newsletter signup:", err);
    res.status(500).json({ error: "Failed to save signup" });
  }
});

export default router;
