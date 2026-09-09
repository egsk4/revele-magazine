import { readFileSync, writeFileSync } from "fs";

const path = "artifacts/api-server/src/routes/admin-subs.ts";
let content = readFileSync(path, "utf8");

function replaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count !== 1) {
    console.error(`[${label}] Expected exactly 1 match, found ${count}. Aborting.`);
    process.exit(1);
  }
  return content.replace(oldStr, newStr);
}

// Import DeleteObjectCommand alongside GetObjectCommand
const oldImport = `import { GetObjectCommand } from "@aws-sdk/client-s3";`;
const newImport = `import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";`;
content = replaceOnce(content, oldImport, newImport, "import");

// Add the new DELETE route right before the files GET route
const oldStr = `router.get("/admin/subs/:id/files", requireAdmin, async (req, res) => {`;
const newStr = `router.delete("/admin/subs/:id/files", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(submissions).where(eq(submissions.id, req.params.id)).limit(1);
    const sub = rows[0];
    if (!sub) return res.status(404).json({ error: "Submission not found" });
    const fileKeys = sub.files || [];
    await Promise.all(
      fileKeys.map((key) => r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })))
    );
    await db.update(submissions).set({ files: [] }).where(eq(submissions.id, req.params.id));
    res.json({ success: true, deletedCount: fileKeys.length });
  } catch (err) {
    console.error("Error deleting files:", err);
    res.status(500).json({ error: "Failed to delete files" });
  }
});

router.get("/admin/subs/:id/files", requireAdmin, async (req, res) => {`;
content = replaceOnce(content, oldStr, newStr, "delete-route");

writeFileSync(path, content, "utf8");
console.log("Patched successfully.");
