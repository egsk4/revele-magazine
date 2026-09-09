// PATH IN YOUR REPO: artifacts/api-server/src/routes/count.ts
//
// Returns the number of rows in the submissions table.
// GET /api/count -> { "count": 16 }

import { Router } from "express";
import { db } from "@workspace/db";
import { submissions } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/count", async (_req, res) => {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions);

    res.json({ count: Number(result[0]?.count ?? 0) });
  } catch (err) {
    console.error("Error counting submissions:", err);
    res.status(500).json({ error: "Failed to count submissions" });
  }
});

export default router;
