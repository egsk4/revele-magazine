import { readFileSync, writeFileSync } from "fs";

const path = "artifacts/api-server/src/routes/admin-subs.ts";
let content = readFileSync(path, "utf8");

const oldStr = "export default router;";
const count = content.split(oldStr).length - 1;
if (count !== 1) {
  console.error(`Expected exactly 1 match for oldStr, found ${count}. Aborting.`);
  process.exit(1);
}

const newStr = `router.get("/admin/subs/:id/files", requireAdmin, async (req, res) => {
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

export default router;`;

content = content.replace(oldStr, newStr);
writeFileSync(path, content, "utf8");
console.log("Patched successfully.");
