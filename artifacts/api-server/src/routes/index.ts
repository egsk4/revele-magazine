// PATH IN YOUR REPO: artifacts/api-server/src/routes/index.ts
//
// Mounts all API routes.

import { Router } from "express";
import healthRouter from "./health";
import countRouter from "./count";
import newsletterRouter from "./newsletter";
import adminLoginRouter from "./admin-login";
import adminSubsRouter from "./admin-subs";
import adminFeaturedRouter from "./admin-featured";
import adminSettingsRouter from "./admin-settings";
import settingsRouter from "./settings";
import featuredPublicRouter from "./featured-public";
import submitRouter from "./submit";
import trackRouter from "./track";
import { publicLimiter, loginLimiter } from "../middleware/rateLimit";

const router = Router();

router.use(healthRouter);
router.use(publicLimiter, countRouter);
router.use(publicLimiter, newsletterRouter);
router.use(loginLimiter, adminLoginRouter);
router.use(adminSubsRouter);
router.use(adminFeaturedRouter);
router.use(adminSettingsRouter);
router.use(publicLimiter, settingsRouter);
router.use(publicLimiter, featuredPublicRouter);
router.use(publicLimiter, submitRouter);
router.use(publicLimiter, trackRouter);

export default router;
