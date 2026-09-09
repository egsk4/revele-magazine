// PATH IN YOUR REPO: artifacts/api-server/src/routes/track.ts
//
// GET /api/track/:email -> { found, submission? }

import { Router } from "express";
import { db } from "@workspace/db";
import { submissions } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";

const router = Router();

router.get("/track/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required" });
    }

    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.email, email))
      .orderBy(desc(submissions.createdAt))
      .limit(1);

    if (rows.length === 0) return res.json({ found: false });

    res.json({
      found: true,
      submission: {
        id: rows[0].id,
        name: rows[0].name,
        series: rows[0].series,
        issue: rows[0].issue,
        status: rows[0].status,
        submitted: rows[0].createdAt,
      },
    });
  } catch (err) {
    console.error("Error tracking submission:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
