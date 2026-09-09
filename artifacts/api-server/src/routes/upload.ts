// PATH IN YOUR REPO: artifacts/api-server/src/routes/upload.ts
//
// POST /api/upload-url  body: { filename, contentType }
// -> { uploadUrl, fileKey }
//
// Generates a presigned R2 upload URL. The browser uploads the file
// directly to R2 using this URL; the file never touches our server.

import { Router } from "express";
import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "../lib/r2";

const router = Router();

const ALLOWED_TYPES = new Set(["image/jpeg", "image/tiff", "image/png"]);
const MAX_FILE_SIZE = 300 * 1024 * 1024; // 300MB per file

router.post("/upload-url", async (req, res) => {
  try {
    const { filename, contentType, fileSize } = req.body ?? {};

    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ error: "filename is required" });
    }
    if (!contentType || !ALLOWED_TYPES.has(contentType)) {
      return res.status(400).json({ error: "File must be JPG, TIFF, or PNG" });
    }
    if (typeof fileSize !== "number" || fileSize <= 0) {
      return res.status(400).json({ error: "fileSize is required" });
    }
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ error: "File exceeds 100MB limit" });
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    const fileKey = `submissions/${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: fileKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 min

    res.json({ uploadUrl, fileKey });
  } catch (err) {
    console.error("Error generating upload URL:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

export default router;
