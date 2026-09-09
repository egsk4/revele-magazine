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

patchFile("artifacts/api-server/src/routes/submit.ts", [
  [`import { Router } from "express";`, `import { Router } from "express";\nimport { publicLimiter } from "../middleware/rateLimit";`, "import"],
  [`router.post("/submit", async (req, res) => {`, `router.post("/submit", publicLimiter, async (req, res) => {`, "route"],
]);

patchFile("artifacts/api-server/src/routes/track.ts", [
  [`import { Router } from "express";`, `import { Router } from "express";\nimport { publicLimiter } from "../middleware/rateLimit";`, "import"],
  [`router.get("/track/:email", async (req, res) => {`, `router.get("/track/:email", publicLimiter, async (req, res) => {`, "route"],
]);

patchFile("artifacts/api-server/src/routes/settings.ts", [
  [`import { Router } from "express";`, `import { Router } from "express";\nimport { publicLimiter } from "../middleware/rateLimit";`, "import"],
  [`router.get("/settings", async (_req, res) => {`, `router.get("/settings", publicLimiter, async (_req, res) => {`, "route"],
]);

patchFile("artifacts/api-server/src/routes/featured-public.ts", [
  [`import { Router } from "express";`, `import { Router } from "express";\nimport { publicLimiter } from "../middleware/rateLimit";`, "import"],
  [`router.get("/featured", async (_req, res) => {`, `router.get("/featured", publicLimiter, async (_req, res) => {`, "route1"],
  [`router.get("/featured/:id", async (req, res) => {`, `router.get("/featured/:id", publicLimiter, async (req, res) => {`, "route2"],
]);

patchFile("artifacts/api-server/src/routes/newsletter.ts", [
  [`import { Router } from "express";`, `import { Router } from "express";\nimport { publicLimiter } from "../middleware/rateLimit";`, "import"],
  [`router.post("/newsletter", async (req, res) => {`, `router.post("/newsletter", publicLimiter, async (req, res) => {`, "route"],
]);

patchFile("artifacts/api-server/src/routes/count.ts", [
  [`import { Router } from "express";`, `import { Router } from "express";\nimport { publicLimiter } from "../middleware/rateLimit";`, "import"],
  [`router.get("/count", async (_req, res) => {`, `router.get("/count", publicLimiter, async (_req, res) => {`, "route"],
]);

patchFile("artifacts/api-server/src/routes/admin-login.ts", [
  [`import { Router } from "express";`, `import { Router } from "express";\nimport { loginLimiter } from "../middleware/rateLimit";`, "import"],
  [`router.post("/admin/login", (req, res) => {`, `router.post("/admin/login", loginLimiter, (req, res) => {`, "route"],
]);

patchFile("artifacts/api-server/src/routes/upload.ts", [
  [`import { Router } from "express";`, `import { Router } from "express";\nimport { uploadLimiter } from "../middleware/rateLimit";`, "import"],
  [`router.post("/upload-url", async (req, res) => {`, `router.post("/upload-url", uploadLimiter, async (req, res) => {`, "route"],
]);

patchFile("artifacts/api-server/src/routes/index.ts", [
  [`import { publicLimiter, loginLimiter, uploadLimiter } from "../middleware/rateLimit";\n`, ``, "remove-import"],
  [`router.use(publicLimiter, countRouter);`, `router.use(countRouter);`, "count"],
  [`router.use(publicLimiter, newsletterRouter);`, `router.use(newsletterRouter);`, "newsletter"],
  [`router.use(loginLimiter, adminLoginRouter);`, `router.use(adminLoginRouter);`, "adminLogin"],
  [`router.use(publicLimiter, settingsRouter);`, `router.use(settingsRouter);`, "settings"],
  [`router.use(publicLimiter, featuredPublicRouter);`, `router.use(featuredPublicRouter);`, "featuredPublic"],
  [`router.use(publicLimiter, submitRouter);`, `router.use(submitRouter);`, "submit"],
  [`router.use(publicLimiter, trackRouter);`, `router.use(trackRouter);`, "track"],
  [`router.use(uploadLimiter, uploadRouter);`, `router.use(uploadRouter);`, "upload"],
]);

console.log("All files patched successfully.");
