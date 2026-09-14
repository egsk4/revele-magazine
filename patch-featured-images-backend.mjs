import { readFileSync, writeFileSync } from "fs";

function replaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count !== 1) {
    console.error(`[${label}] Expected exactly 1 match, found ${count}. Aborting.`);
    process.exit(1);
  }
  return content.replace(oldStr, newStr);
}

function patchFile(path, edits) {
  let content = readFileSync(path, "utf8");
  for (const [oldStr, newStr, label] of edits) {
    content = replaceOnce(content, oldStr, newStr, `${path}:${label}`);
  }
  writeFileSync(path, content, "utf8");
  console.log(`Patched ${path}`);
}

// ── featured-public.ts: sign image URLs for public consumption ──
patchFile("artifacts/api-server/src/routes/featured-public.ts", [
  [
    `import { and, eq, asc } from "drizzle-orm";`,
    `import { and, eq, asc } from "drizzle-orm";\nimport { GetObjectCommand } from "@aws-sdk/client-s3";\nimport { getSignedUrl } from "@aws-sdk/s3-request-presigner";\nimport { r2, R2_BUCKET } from "../lib/r2";\n\nasync function signImages(keys) {\n  const list = keys || [];\n  return Promise.all(\n    list.map(async (key) => {\n      const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });\n      return getSignedUrl(r2, command, { expiresIn: 3600 });\n    })\n  );\n}`,
    "imports",
  ],
  [
    `    res.json({ featured: rows });\n  } catch (err) {\n    console.error("Error loading featured:", err);`,
    `    const withUrls = await Promise.all(rows.map(async (row) => ({ ...row, imageUrls: await signImages(row.images) })));\n    res.json({ featured: withUrls });\n  } catch (err) {\n    console.error("Error loading featured:", err);`,
    "list-sign",
  ],
  [
    `    if (rows.length === 0) return res.status(404).json({ error: "Not found" });\n    res.json({ item: rows[0] });`,
    `    if (rows.length === 0) return res.status(404).json({ error: "Not found" });\n    const item = { ...rows[0], imageUrls: await signImages(rows[0].images) };\n    res.json({ item });`,
    "detail-sign",
  ],
]);

// ── admin-featured.ts: accept images in POST/PATCH, sign for admin preview, add upload-url route ──
patchFile("artifacts/api-server/src/routes/admin-featured.ts", [
  [
    `import { requireAdmin } from "../middleware/requireAdmin";`,
    `import { requireAdmin } from "../middleware/requireAdmin";\nimport { randomUUID as uuid4 } from "crypto";\nimport { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";\nimport { getSignedUrl } from "@aws-sdk/s3-request-presigner";\nimport { r2, R2_BUCKET } from "../lib/r2";\n\nconst ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);\nconst MAX_FEATURED_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB`,
    "imports",
  ],
  [
    `    const rows = await db.select().from(featured).orderBy(asc(featured.sortOrder), asc(featured.createdAt));\n    res.json({ featured: rows });`,
    `    const rows = await db.select().from(featured).orderBy(asc(featured.sortOrder), asc(featured.createdAt));\n    const withUrls = await Promise.all(rows.map(async (row) => ({\n      ...row,\n      imageUrls: await Promise.all((row.images || []).map(async (key) => {\n        const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });\n        const url = await getSignedUrl(r2, command, { expiresIn: 3600 });\n        return { key, url };\n      })),\n    })));\n    res.json({ featured: withUrls });`,
    "list-sign",
  ],
  [
    `    const { series, photographer, instagram, issue, credits, story, status } = req.body ?? {};`,
    `    const { series, photographer, instagram, issue, credits, story, status, images } = req.body ?? {};`,
    "post-destructure",
  ],
  [
    `      status: status === "published" ? "published" : "draft",\n      sortOrder: 0,\n    });`,
    `      status: status === "published" ? "published" : "draft",\n      images: Array.isArray(images) ? images : [],\n      sortOrder: 0,\n    });`,
    "post-insert",
  ],
  [
    `    const { status, series, photographer, instagram, issue, credits, story, sortOrder } = req.body ?? {};`,
    `    const { status, series, photographer, instagram, issue, credits, story, sortOrder, images } = req.body ?? {};`,
    "patch-destructure",
  ],
  [
    `    if (sortOrder !== undefined) updates.sortOrder = sortOrder;`,
    `    if (sortOrder !== undefined) updates.sortOrder = sortOrder;\n    if (images !== undefined) updates.images = images;`,
    "patch-update",
  ],
  [
    `export default router;`,
    `router.post("/admin/featured/upload-url", requireAdmin, async (req, res) => {\n  try {\n    const { filename, contentType, fileSize } = req.body ?? {};\n    if (!filename || typeof filename !== "string") return res.status(400).json({ error: "filename is required" });\n    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) return res.status(400).json({ error: "File must be JPG, PNG, or WEBP" });\n    if (typeof fileSize !== "number" || fileSize <= 0) return res.status(400).json({ error: "fileSize is required" });\n    if (fileSize > MAX_FEATURED_IMAGE_SIZE) return res.status(400).json({ error: "File exceeds 50MB limit" });\n\n    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";\n    const fileKey = \`featured/\${uuid4()}.\${ext}\`;\n    const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: fileKey, ContentType: contentType });\n    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 });\n    res.json({ uploadUrl, fileKey });\n  } catch (err) {\n    console.error("Error generating featured upload URL:", err);\n    res.status(500).json({ error: "Failed to generate upload URL" });\n  }\n});\n\nexport default router;`,
    "upload-route",
  ],
]);

// ── admin-subs.ts: copy submission files into the new featured entry's images on promote ──
patchFile("artifacts/api-server/src/routes/admin-subs.ts", [
  [
    `      status: "draft",\n      submissionId: sub.id,\n      sortOrder: 0,\n    });`,
    `      status: "draft",\n      submissionId: sub.id,\n      images: sub.files || [],\n      sortOrder: 0,\n    });`,
    "promote-images",
  ],
]);

console.log("All backend files patched successfully.");
