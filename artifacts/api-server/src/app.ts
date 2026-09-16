import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust Render's reverse proxy so express-rate-limit and req.ip correctly read the real client IP
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Only these origins may call the API from a browser. Vercel preview
// deployments get a fresh *.vercel.app URL per branch, so those are
// allowed via pattern match rather than listed individually. Anything
// else (curl, server-to-server, Postman) isn't affected by CORS at all,
// this only blocks browser-based requests from other websites.
const ALLOWED_ORIGINS = [
  "https://www.revelemagazine.com",
  "https://revelemagazine.com",
];
const VERCEL_PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
const isDev = process.env["NODE_ENV"] !== "production";

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header at all means it's not a cross-site browser request
      // (curl, server-to-server calls, same-origin requests) — always allow.
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (VERCEL_PREVIEW_PATTERN.test(origin)) return callback(null, true);
      if (isDev && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
