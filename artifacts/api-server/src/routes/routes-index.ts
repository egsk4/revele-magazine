// PATH IN YOUR REPO: artifacts/api-server/src/routes/index.ts
//
// This REPLACES your current file. It now mounts health, count, and newsletter.

import { Router } from "express";
import healthRouter from "./health";
import countRouter from "./count";
import newsletterRouter from "./newsletter";

const router = Router();

router.use(healthRouter);
router.use(countRouter);
router.use(newsletterRouter);

export default router;
