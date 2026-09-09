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

const router = Router();

router.use(healthRouter);
router.use(countRouter);
router.use(newsletterRouter);
router.use(adminLoginRouter);
router.use(adminSubsRouter);
router.use(adminFeaturedRouter);
router.use(adminSettingsRouter);
router.use(settingsRouter);
router.use(featuredPublicRouter);
router.use(submitRouter);
router.use(trackRouter);

export default router;
