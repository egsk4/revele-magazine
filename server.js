/**
 * ═══════════════════════════════════════════════════════════════════
 *  REVELE MAGAZINE — Backend API Server
 *  Node.js + Express + SQLite (via better-sqlite3)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  SETUP:
 *    npm install express better-sqlite3 cors express-rate-limit uuid \
 *                resend @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 *    node server.js
 *
 *  ENVIRONMENT VARIABLES — see .env.example for full list
 *
 *  ENDPOINTS:
 *    POST   /api/submit                      — Submit photography project
 *    GET    /api/track/:email                — Check submission status
 *    GET    /api/count                       — Total submission count
 *    POST   /api/newsletter                  — Newsletter signup
 *    GET    /api/newsletter/unsubscribe      — Unsubscribe (email + token)
 *    POST   /api/admin/login                 — Admin auth (returns token)
 *    GET    /api/admin/subs                  — All submissions (admin)
 *    PATCH  /api/admin/subs/:id             — Update status (admin)
 *    DELETE /api/admin/subs/:id             — Delete submission (admin)
 *    GET    /api/admin/stats                 — Dashboard stats (admin)
 *    POST   /api/admin/subs/:id/upload-link — Send R2 upload link (admin)
 *    GET    /api/upload/:token              — Validate upload token (photographer)
 *    POST   /api/upload/:token/presign      — Get R2 pre-signed PUT URL
 *    POST   /api/upload/:token/complete     — Mark upload done
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const Database   = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const crypto     = require('crypto');

// Optional dependencies — gracefully disabled if not installed
let Resend, S3Client, PutObjectCommand, getSignedUrl;
try {
  ({ Resend } = require('resend'));
} catch { Resend = null; }
try {
  ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
  ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
} catch { S3Client = null; }

// ─── SECURITY WARNING ─────────────────────────────────────────────────────────
// NEVER hard-code secrets in source code. All secrets MUST be set as environment
// variables on your server (Render dashboard → Environment).
//
// ACTION REQUIRED:
//   1. Regenerate both Discord webhooks in your Discord server settings.
//   2. Change your admin password to something strong and unique.
//   3. Set ALL env vars listed in .env.example on Render.
// ─────────────────────────────────────────────────────────────────────────────

// ─── CONFIGURATION ───────────────────────────────────────────────────────────

const CONFIG = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Discord webhooks — set env vars; no hardcoded fallback for security
  SUBMISSIONS_WEBHOOK: process.env.SUBMISSIONS_WEBHOOK || '',
  NEWSLETTER_WEBHOOK:  process.env.NEWSLETTER_WEBHOOK  || '',

  // Admin password — MUST be set via env var in production
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || (() => {
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL] ADMIN_PASSWORD environment variable is not set. Refusing to start in production.');
      process.exit(1);
    }
    console.warn('[WARN] ADMIN_PASSWORD not set — using insecure default. Set the env var before deploying.');
    return 'change-me-before-deploying';
  })(),

  // Database
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'revele.db'),

  // Resend email — https://resend.com (free: 100/day, 3 000/month)
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  FROM_EMAIL:     process.env.FROM_EMAIL     || 'submissions@revelemagazine.com',
  FROM_NAME:      process.env.FROM_NAME      || 'Révèle Magazine',

  // Site base URL (used in email links)
  SITE_URL: process.env.SITE_URL || 'https://revelemagazine.com',

  // Cloudflare R2 — https://dash.cloudflare.com → R2
  R2_ACCOUNT_ID:        process.env.R2_ACCOUNT_ID        || '',
  R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID     || '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
  R2_BUCKET:            process.env.R2_BUCKET            || 'revele-submissions',
  R2_PUBLIC_URL:        process.env.R2_PUBLIC_URL        || '',
};

// ─── DATABASE SETUP ──────────────────────────────────────────────────────────

const db = new Database(CONFIG.DB_PATH);
db.pragma('journal_mode = WAL');

// Core submissions table
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    email               TEXT NOT NULL,
    instagram           TEXT,
    website             TEXT,
    series              TEXT NOT NULL,
    credits             TEXT NOT NULL,
    story               TEXT,
    issue               TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'received',
    upload_token        TEXT,
    upload_completed_at TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
  )
`);

// Add new columns to existing databases (safe: IF NOT EXISTS via try/catch)
const submissionMigrations = ['website', 'upload_token', 'upload_completed_at'];
for (const col of submissionMigrations) {
  try {
    if (col === 'website')             db.exec(`ALTER TABLE submissions ADD COLUMN website TEXT`);
    if (col === 'upload_token')        db.exec(`ALTER TABLE submissions ADD COLUMN upload_token TEXT`);
    if (col === 'upload_completed_at') db.exec(`ALTER TABLE submissions ADD COLUMN upload_completed_at TEXT`);
  } catch { /* column already exists */ }
}

// Newsletter subscribers
db.exec(`
  CREATE TABLE IF NOT EXISTS newsletter (
    id                TEXT PRIMARY KEY,
    email             TEXT UNIQUE NOT NULL,
    unsubscribe_token TEXT,
    created_at        TEXT NOT NULL
  )
`);
try { db.exec(`ALTER TABLE newsletter ADD COLUMN unsubscribe_token TEXT`); } catch { /* exists */ }

// Upload tokens (separate table for audit trail)
db.exec(`
  CREATE TABLE IF NOT EXISTS upload_tokens (
    token        TEXT PRIMARY KEY,
    sub_id       TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    used_at      TEXT,
    FOREIGN KEY (sub_id) REFERENCES submissions(id) ON DELETE CASCADE
  )
`);

// ─── CLOUDFLARE R2 CLIENT ─────────────────────────────────────────────────────

let r2Client = null;
if (S3Client && CONFIG.R2_ACCOUNT_ID && CONFIG.R2_ACCESS_KEY_ID && CONFIG.R2_SECRET_ACCESS_KEY) {
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${CONFIG.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     CONFIG.R2_ACCESS_KEY_ID,
      secretAccessKey: CONFIG.R2_SECRET_ACCESS_KEY,
    },
  });
  console.log('[R2] Cloudflare R2 client initialised — bucket:', CONFIG.R2_BUCKET);
} else {
  console.log('[R2] R2 not configured — upload features disabled. Set R2_* env vars to enable.');
}

// ─── RESEND EMAIL CLIENT ──────────────────────────────────────────────────────

let resendClient = null;
if (Resend && CONFIG.RESEND_API_KEY) {
  resendClient = new Resend(CONFIG.RESEND_API_KEY);
  console.log('[Email] Resend client initialised');
} else {
  console.log('[Email] Resend not configured — confirmation emails disabled. Set RESEND_API_KEY to enable.');
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

function sanitize(str, maxLen = 5000) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/<[^>]*>/g, '').substring(0, maxLen);
}

async function sendDiscordWebhook(url, payload) {
  if (!url) {
    console.log('[Discord] URL not configured — skipping. Set the env var to enable.');
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error('[Discord] HTTP', res.status, await res.text());
  } catch (err) {
    console.error('[Discord] Failed:', err.message);
  }
}

function notifyNewSubmission(sub) {
  const embed = {
    title: `📸 New Submission — ${sub.series}`,
    color: 0xC8A06A,
    fields: [
      { name: '👤 Photographer', value: sub.name,                        inline: true },
      { name: '📧 Email',        value: sub.email,                       inline: true },
      { name: '📸 Instagram',    value: sub.instagram || 'Not provided',  inline: true },
      { name: '🌐 Website',      value: sub.website   || 'Not provided',  inline: true },
      { name: '📰 Issue',        value: sub.issue,                       inline: true },
      { name: '🆔 Submission ID', value: `\`${sub.id}\``,                inline: true },
      { name: '📅 Submitted',    value: new Date(sub.created_at).toLocaleString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }), inline: true },
      { name: '🎭 Team Credits', value: sub.credits.substring(0, 1000) },
      { name: '✍️ Story',        value: sub.story
          ? sub.story.substring(0, 500) + (sub.story.length > 500 ? '…' : '')
          : '*Not provided*' },
    ],
    footer: { text: 'Submitted via revelemagazine.com — Revele Submissions System' },
    timestamp: sub.created_at,
  };
  return sendDiscordWebhook(CONFIG.SUBMISSIONS_WEBHOOK, {
    username: 'Revele Submissions',
    avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
    embeds: [embed],
  });
}

function notifyNewsletter(email) {
  const embed = {
    title: '📬 New Newsletter Subscriber',
    color: 0x8888CC,
    fields: [
      { name: '📧 Email', value: email, inline: true },
      { name: '📅 Date',  value: new Date().toLocaleString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }), inline: true },
    ],
    footer: { text: 'Newsletter signup — revelemagazine.com' },
    timestamp: new Date().toISOString(),
  };
  return sendDiscordWebhook(CONFIG.NEWSLETTER_WEBHOOK, { username: 'Revele Newsletter', embeds: [embed] });
}

/**
 * Send a submission confirmation email via Resend.
 * Silently skips if Resend is not configured.
 */
async function sendConfirmationEmail(sub) {
  if (!resendClient) return;
  try {
    const { error } = await resendClient.emails.send({
      from:    `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
      to:      [sub.email],
      subject: `We received your submission — ${sub.series}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Georgia,serif;color:#e8e0d4">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header -->
        <tr><td style="padding:0 0 32px;border-bottom:1px solid rgba(200,160,106,0.3);text-align:center">
          <p style="font-family:Georgia,serif;font-size:28px;letter-spacing:0.3em;color:#c8a06a;margin:0">RÉVÈLE</p>
          <p style="font-size:11px;letter-spacing:0.25em;color:#888;margin:6px 0 0;text-transform:uppercase">Visual Arts Magazine</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 0 0">
          <p style="font-size:15px;line-height:1.8;color:#c0b89a;margin:0 0 24px">Dear ${sub.name},</p>
          <p style="font-size:15px;line-height:1.8;color:#c0b89a;margin:0 0 24px">
            Thank you for submitting <em>${sub.series}</em> to Révèle. We have received your project
            for <strong style="color:#c8a06a">${sub.issue}</strong> and it is now in our queue.
          </p>
          <!-- Details card -->
          <table width="100%" cellpadding="16" cellspacing="0" style="background:rgba(200,160,106,0.06);border:1px solid rgba(200,160,106,0.2);border-radius:8px;margin:0 0 24px">
            <tr><td>
              <p style="font-size:11px;letter-spacing:0.2em;color:#888;margin:0 0 12px;text-transform:uppercase">Submission Details</p>
              <p style="font-size:14px;color:#c0b89a;margin:0 0 6px"><strong style="color:#c8a06a">Series:</strong> ${sub.series}</p>
              <p style="font-size:14px;color:#c0b89a;margin:0 0 6px"><strong style="color:#c8a06a">Issue:</strong> ${sub.issue}</p>
              <p style="font-size:14px;color:#c0b89a;margin:0"><strong style="color:#c8a06a">Reference ID:</strong> <code style="font-family:monospace;font-size:12px">${sub.id}</code></p>
            </td></tr>
          </table>
          <p style="font-size:15px;line-height:1.8;color:#c0b89a;margin:0 0 24px">
            Our editorial team reviews every submission carefully. You can expect to hear from us
            within <strong style="color:#c8a06a">7–10 days</strong>. In the meantime, you can track
            your submission status at any time:
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
            <tr><td style="background:#c8a06a;border-radius:4px;padding:12px 24px">
              <a href="${CONFIG.SITE_URL}/#tracker" style="font-family:Georgia,serif;font-size:13px;letter-spacing:0.15em;color:#000;text-decoration:none;text-transform:uppercase">Track Your Submission</a>
            </td></tr>
          </table>
          <p style="font-size:14px;line-height:1.8;color:#888;margin:0 0 8px">With gratitude,</p>
          <p style="font-size:15px;line-height:1.8;color:#c8a06a;margin:0">The Révèle Editorial Team</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:32px 0 0;border-top:1px solid rgba(255,255,255,0.07);margin-top:32px">
          <p style="font-size:11px;color:#555;line-height:1.7;margin:0;text-align:center">
            This email was sent because a submission was received using this address.<br>
            If you did not submit to Révèle, please disregard this message.<br>
            <a href="mailto:submissions@revelemagazine.com" style="color:#888;text-decoration:none">submissions@revelemagazine.com</a>
            &nbsp;·&nbsp; <a href="${CONFIG.SITE_URL}" style="color:#888;text-decoration:none">revelemagazine.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
    });
    if (error) console.error('[Email] Resend error:', error);
    else console.log(`[Email] Confirmation sent to ${sub.email}`);
  } catch (err) {
    console.error('[Email] Failed to send confirmation:', err.message);
  }
}

/**
 * Send an upload invitation email to an accepted photographer.
 */
async function sendUploadInviteEmail(sub, uploadToken) {
  if (!resendClient) return;
  const uploadUrl = `${CONFIG.SITE_URL}/#upload?token=${uploadToken}`;
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  try {
    const { error } = await resendClient.emails.send({
      from:    `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
      to:      [sub.email],
      subject: `Your work has been accepted — please upload your images`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Georgia,serif;color:#e8e0d4">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="padding:0 0 32px;border-bottom:1px solid rgba(200,160,106,0.3);text-align:center">
          <p style="font-family:Georgia,serif;font-size:28px;letter-spacing:0.3em;color:#c8a06a;margin:0">RÉVÈLE</p>
          <p style="font-size:11px;letter-spacing:0.25em;color:#888;margin:6px 0 0;text-transform:uppercase">Visual Arts Magazine</p>
        </td></tr>
        <tr><td style="padding:36px 0 0">
          <p style="font-size:15px;line-height:1.8;color:#c0b89a;margin:0 0 24px">Dear ${sub.name},</p>
          <p style="font-size:15px;line-height:1.8;color:#c0b89a;margin:0 0 24px">
            We are thrilled to inform you that <em>${sub.series}</em> has been
            <strong style="color:#c8a06a">accepted</strong> for ${sub.issue}.
          </p>
          <p style="font-size:15px;line-height:1.8;color:#c0b89a;margin:0 0 24px">
            Please use the private upload link below to submit your full-resolution image files.
            Upload your images exactly as you intend them to appear — we do not compress or alter
            your files in any way. This link expires on <strong style="color:#c8a06a">${expiryDate}</strong>.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
            <tr><td style="background:#c8a06a;border-radius:4px;padding:14px 28px">
              <a href="${uploadUrl}" style="font-family:Georgia,serif;font-size:13px;letter-spacing:0.15em;color:#000;text-decoration:none;text-transform:uppercase">Upload Your Images</a>
            </td></tr>
          </table>
          <table width="100%" cellpadding="14" cellspacing="0" style="background:rgba(200,160,106,0.06);border:1px solid rgba(200,160,106,0.2);border-radius:8px;margin:0 0 24px">
            <tr><td>
              <p style="font-size:11px;letter-spacing:0.2em;color:#888;margin:0 0 10px;text-transform:uppercase">Upload Guidelines</p>
              <p style="font-size:13px;color:#c0b89a;margin:0 0 5px">• TIFF or high-quality JPEG, minimum 300 DPI at final print size</p>
              <p style="font-size:13px;color:#c0b89a;margin:0 0 5px">• sRGB or Adobe RGB colour profile</p>
              <p style="font-size:13px;color:#c0b89a;margin:0 0 5px">• No watermarks or overlays</p>
              <p style="font-size:13px;color:#c0b89a;margin:0">• Up to 20 images per series</p>
            </td></tr>
          </table>
          <p style="font-size:15px;line-height:1.8;color:#c0b89a;margin:0 0 8px">Congratulations, and we look forward to seeing your work in print.</p>
          <p style="font-size:15px;line-height:1.8;color:#c8a06a;margin:0">The Révèle Editorial Team</p>
        </td></tr>
        <tr><td style="padding:32px 0 0;border-top:1px solid rgba(255,255,255,0.07);margin-top:32px">
          <p style="font-size:11px;color:#555;line-height:1.7;margin:0;text-align:center">
            If the button above does not work, copy this URL into your browser:<br>
            <a href="${uploadUrl}" style="color:#888;word-break:break-all">${uploadUrl}</a><br><br>
            <a href="mailto:submissions@revelemagazine.com" style="color:#888;text-decoration:none">submissions@revelemagazine.com</a>
            &nbsp;·&nbsp; <a href="${CONFIG.SITE_URL}" style="color:#888;text-decoration:none">revelemagazine.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
    });
    if (error) console.error('[Email] Upload invite error:', error);
    else console.log(`[Email] Upload invite sent to ${sub.email}`);
  } catch (err) {
    console.error('[Email] Failed to send upload invite:', err.message);
  }
}

// ─── ADMIN SESSION STORE ──────────────────────────────────────────────────────

const adminSessions = new Map();

function createAdminToken() {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + 86_400_000); // 24h TTL
  return token;
}

function validateAdminToken(token) {
  if (!token) return false;
  const expiry = adminSessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { adminSessions.delete(token); return false; }
  return true;
}

function requireAdmin(req, res, next) {
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized. Please log in to the admin panel.' });
  }
  next();
}

// ─── EXPRESS APP ─────────────────────────────────────────────────────────────

const app = express();

app.use(express.json({ limit: '1mb' }));

// CORS — locked to production domain in production, open in dev
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['https://revelemagazine.com', 'https://www.revelemagazine.com'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (CONFIG.NODE_ENV !== 'production' && (origin.startsWith('http://localhost') || origin.startsWith('http://127.'))) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' is not allowed.`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Serve frontend
app.use(express.static(__dirname));

// ─── RATE LIMITING ───────────────────────────────────────────────────────────

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  message: { error: 'Too many submissions from this IP. Please try again in 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
});
const newsletterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { error: 'Too many requests. Please try again later.' },
});
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  message: { error: 'Too many requests. Please slow down.' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
});

app.use('/api/', generalLimiter);

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────────

/**
 * POST /api/submit
 * Submit a new photography project.
 * Body: { name, email, instagram, website, series, credits, story, issue }
 */
app.post('/api/submit', submitLimiter, async (req, res) => {
  try {
    const { name, email, instagram, website, series, credits, story, issue } = req.body;

    const errors = [];
    if (!name    || typeof name    !== 'string' || name.trim().length < 2)    errors.push('Full name is required.');
    if (!email   || typeof email   !== 'string' || !email.includes('@'))       errors.push('A valid email address is required.');
    if (!series  || typeof series  !== 'string' || series.trim().length < 2)  errors.push('Series title is required.');
    if (!credits || typeof credits !== 'string' || credits.trim().length < 5) errors.push('Team credits are required.');
    if (!issue   || typeof issue   !== 'string')                               errors.push('Please select an issue.');
    if (errors.length > 0) return res.status(400).json({ error: errors.join(' ') });

    const existing = db.prepare(
      'SELECT id FROM submissions WHERE email = ? AND issue = ?'
    ).get(email.toLowerCase().trim(), sanitize(issue, 100));
    if (existing) {
      return res.status(409).json({
        error: 'A submission from this email already exists for this issue. Email submissions@revelemagazine.com to update it.',
      });
    }

    const now = new Date().toISOString();
    const sub = {
      id:         uuidv4(),
      name:       sanitize(name, 200),
      email:      email.toLowerCase().trim(),
      instagram:  sanitize(instagram || '', 100),
      website:    sanitize(website   || '', 300),
      series:     sanitize(series, 300),
      credits:    sanitize(credits, 3000),
      story:      sanitize(story || '', 5000),
      issue:      sanitize(issue, 100),
      status:     'received',
      upload_token:        null,
      upload_completed_at: null,
      created_at: now,
      updated_at: now,
    };

    db.prepare(`
      INSERT INTO submissions
        (id, name, email, instagram, website, series, credits, story, issue, status, upload_token, upload_completed_at, created_at, updated_at)
      VALUES
        (@id, @name, @email, @instagram, @website, @series, @credits, @story, @issue, @status, @upload_token, @upload_completed_at, @created_at, @updated_at)
    `).run(sub);

    // Fire-and-forget — do not block the HTTP response
    Promise.allSettled([
      notifyNewSubmission(sub),
      sendConfirmationEmail(sub),
    ]).catch(() => {});

    return res.status(201).json({
      success: true,
      id:      sub.id,
      message: `Submission received! A confirmation has been sent to ${sub.email}. We'll be in touch within 7–10 days.`,
    });

  } catch (err) {
    console.error('[POST /api/submit]', err);
    return res.status(500).json({
      error: 'An unexpected error occurred. Please email submissions@revelemagazine.com if this persists.',
    });
  }
});

/**
 * GET /api/track/:email
 * Check submission status.
 */
app.get('/api/track/:email', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const sub = db.prepare(`
      SELECT id, name, series, issue, status, upload_completed_at, created_at, updated_at
      FROM submissions WHERE email = ? ORDER BY created_at DESC LIMIT 1
    `).get(email);

    if (!sub) return res.json({ found: false });

    return res.json({
      found: true,
      submission: {
        id:                 sub.id,
        name:               sub.name,
        series:             sub.series,
        issue:              sub.issue,
        status:             sub.status,
        uploadCompleted:    !!sub.upload_completed_at,
        submitted:          sub.created_at,
        updated:            sub.updated_at,
      },
    });
  } catch (err) {
    console.error('[GET /api/track]', err);
    return res.status(500).json({ error: 'Could not retrieve submission status.' });
  }
});

/**
 * GET /api/count
 */
app.get('/api/count', (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM submissions').get();
    return res.json({ count: row.count });
  } catch (err) {
    console.error('[GET /api/count]', err);
    return res.status(500).json({ count: 0 });
  }
});

/**
 * POST /api/newsletter
 */
app.post('/api/newsletter', newsletterLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    const cleanEmail = email.toLowerCase().trim();
    const unsubToken = crypto.randomBytes(20).toString('hex');
    db.prepare(`
      INSERT OR IGNORE INTO newsletter (id, email, unsubscribe_token, created_at)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), cleanEmail, unsubToken, new Date().toISOString());

    notifyNewsletter(cleanEmail).catch(err => console.error('[Newsletter Webhook]', err));
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/newsletter]', err);
    return res.status(500).json({ error: 'Could not process your signup. Please try again.' });
  }
});

/**
 * GET /api/newsletter/unsubscribe?email=...&token=...
 * Unsubscribe from newsletter via a link in an email.
 */
app.get('/api/newsletter/unsubscribe', (req, res) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    const token = (req.query.token || '').trim();

    if (!email || !token) {
      return res.status(400).send('<p style="font-family:sans-serif">Missing email or token.</p>');
    }

    const row = db.prepare(
      'SELECT id FROM newsletter WHERE email = ? AND unsubscribe_token = ?'
    ).get(email, token);

    if (!row) {
      return res.status(400).send(`
        <html><body style="font-family:Georgia,serif;background:#0a0a0a;color:#c0b89a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <p style="font-size:28px;letter-spacing:0.3em;color:#c8a06a">RÉVÈLE</p>
            <p>Invalid or expired unsubscribe link.</p>
            <p style="font-size:13px;color:#666">If you need help, email <a href="mailto:submissions@revelemagazine.com" style="color:#c8a06a">submissions@revelemagazine.com</a></p>
          </div>
        </body></html>`);
    }

    db.prepare('DELETE FROM newsletter WHERE email = ? AND unsubscribe_token = ?').run(email, token);

    return res.send(`
      <html><body style="font-family:Georgia,serif;background:#0a0a0a;color:#c0b89a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <p style="font-size:28px;letter-spacing:0.3em;color:#c8a06a">RÉVÈLE</p>
          <p>You have been unsubscribed.</p>
          <p style="font-size:13px;color:#666"><a href="${CONFIG.SITE_URL}" style="color:#c8a06a">Return to revelemagazine.com</a></p>
        </div>
      </body></html>`);
  } catch (err) {
    console.error('[GET /api/newsletter/unsubscribe]', err);
    return res.status(500).send('<p style="font-family:sans-serif">An error occurred. Please try again.</p>');
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

/**
 * POST /api/admin/login
 */
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (typeof password !== 'string' || password !== CONFIG.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  return res.json({ success: true, token: createAdminToken() });
});

/**
 * GET /api/admin/subs
 * Supports: search, status, sort query params.
 */
app.get('/api/admin/subs', requireAdmin, (req, res) => {
  try {
    const { search, status, sort } = req.query;
    let query  = 'SELECT * FROM submissions WHERE 1=1';
    const params = [];

    const validStatuses = ['received', 'reviewing', 'accepted', 'declined', 'published'];
    if (status && validStatuses.includes(status)) {
      query += ' AND status = ?'; params.push(status);
    }
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const term = '%' + search.trim().replace(/[%_]/g, '\\$&') + '%';
      query += ' AND (name LIKE ? OR email LIKE ? OR series LIKE ?)';
      params.push(term, term, term);
    }
    query += sort === 'oldest' ? ' ORDER BY created_at ASC' : ' ORDER BY created_at DESC';

    return res.json({ submissions: db.prepare(query).all(...params) });
  } catch (err) {
    console.error('[GET /api/admin/subs]', err);
    return res.status(500).json({ error: 'Could not retrieve submissions.' });
  }
});

/**
 * PATCH /api/admin/subs/:id
 * Update submission status.
 */
app.patch('/api/admin/subs/:id', requireAdmin, (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;
    const validStatuses = ['received', 'reviewing', 'accepted', 'declined', 'published'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }
    const result = db.prepare(
      'UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, new Date().toISOString(), id);
    if (result.changes === 0) return res.status(404).json({ error: 'Submission not found.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/admin/subs]', err);
    return res.status(500).json({ error: 'Could not update submission.' });
  }
});

/**
 * DELETE /api/admin/subs/:id
 */
app.delete('/api/admin/subs/:id', requireAdmin, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Submission not found.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/admin/subs]', err);
    return res.status(500).json({ error: 'Could not delete submission.' });
  }
});

/**
 * GET /api/admin/stats
 */
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const rows  = db.prepare('SELECT status, COUNT(*) as count FROM submissions GROUP BY status').all();
    const stats = { total: 0, received: 0, reviewing: 0, accepted: 0, declined: 0, published: 0 };
    for (const row of rows) {
      if (row.status in stats) stats[row.status] = row.count;
      stats.total += row.count;
    }
    return res.json(stats);
  } catch (err) {
    console.error('[GET /api/admin/stats]', err);
    return res.status(500).json({ error: 'Could not retrieve statistics.' });
  }
});

/**
 * POST /api/admin/subs/:id/upload-link
 * Generate a one-time upload token and email it to the accepted photographer.
 * Marks the submission as 'accepted' if it isn't already.
 */
app.post('/api/admin/subs/:id/upload-link', requireAdmin, async (req, res) => {
  try {
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Submission not found.' });

    // Generate a new upload token
    const token     = crypto.randomBytes(32).toString('hex');
    const now       = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Store token in upload_tokens table
    db.prepare(`
      INSERT INTO upload_tokens (token, sub_id, created_at, expires_at) VALUES (?, ?, ?, ?)
    `).run(token, sub.id, now, expiresAt);

    // Also store token reference on the submission row
    db.prepare(
      "UPDATE submissions SET upload_token = ?, status = 'accepted', updated_at = ? WHERE id = ?"
    ).run(token, now, sub.id);

    // Send the invite email
    await sendUploadInviteEmail(sub, token);

    return res.json({
      success:  true,
      token,
      uploadUrl: `${CONFIG.SITE_URL}/#upload?token=${token}`,
      expiresAt,
      emailSent: !!resendClient,
      message:  resendClient
        ? `Upload link emailed to ${sub.email}`
        : `Upload link generated (email not configured — share manually): ${CONFIG.SITE_URL}/#upload?token=${token}`,
    });
  } catch (err) {
    console.error('[POST /api/admin/subs/:id/upload-link]', err);
    return res.status(500).json({ error: 'Could not generate upload link.' });
  }
});

// ─── UPLOAD ROUTES (photographer-facing) ─────────────────────────────────────

/**
 * GET /api/upload/:token
 * Validate an upload token. Returns submission info if valid.
 */
app.get('/api/upload/:token', (req, res) => {
  try {
    const { token } = req.params;
    const row = db.prepare(`
      SELECT t.*, s.name, s.email, s.series, s.issue, s.upload_completed_at
      FROM upload_tokens t
      JOIN submissions s ON s.id = t.sub_id
      WHERE t.token = ?
    `).get(token);

    if (!row) return res.status(404).json({ valid: false, error: 'Upload link not found.' });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ valid: false, error: 'This upload link has expired. Please contact submissions@revelemagazine.com.' });
    }

    return res.json({
      valid: true,
      r2Available: !!r2Client,
      submission: {
        name:            row.name,
        series:          row.series,
        issue:           row.issue,
        uploadCompleted: !!row.upload_completed_at,
        expiresAt:       row.expires_at,
      },
    });
  } catch (err) {
    console.error('[GET /api/upload/:token]', err);
    return res.status(500).json({ valid: false, error: 'Could not validate upload token.' });
  }
});

/**
 * POST /api/upload/:token/presign
 * Generate a Cloudflare R2 pre-signed PUT URL for a single file.
 * The browser uses this URL to upload directly to R2 — the server never touches the file bytes.
 *
 * Body: { filename, contentType }
 * Returns: { url, key }
 */
app.post('/api/upload/:token/presign', async (req, res) => {
  try {
    if (!r2Client) {
      return res.status(503).json({ error: 'File upload is not configured on this server. Please contact submissions@revelemagazine.com.' });
    }

    const { token } = req.params;
    const row = db.prepare(`
      SELECT t.sub_id, t.expires_at, s.id, s.series
      FROM upload_tokens t JOIN submissions s ON s.id = t.sub_id
      WHERE t.token = ?
    `).get(token);

    if (!row) return res.status(404).json({ error: 'Upload link not found.' });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This upload link has expired.' });
    }

    const { filename, contentType } = req.body;
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'filename is required.' });
    }

    // Sanitise the filename — keep extension, strip path traversal attempts
    const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `submissions/${row.sub_id}/${Date.now()}_${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket:      CONFIG.R2_BUCKET,
      Key:         key,
      ContentType: contentType || 'application/octet-stream',
    });

    // Pre-sign for 15 minutes — enough time for the browser to start the upload
    const url = await getSignedUrl(r2Client, command, { expiresIn: 900 });

    return res.json({ url, key });
  } catch (err) {
    console.error('[POST /api/upload/:token/presign]', err);
    return res.status(500).json({ error: 'Could not generate upload URL.' });
  }
});

/**
 * POST /api/upload/:token/complete
 * Photographer calls this after finishing all uploads.
 * Marks the upload as done and stamps the timestamp.
 *
 * Body: { fileKeys: string[] }  (optional — list of uploaded R2 keys for audit)
 */
app.post('/api/upload/:token/complete', (req, res) => {
  try {
    const { token } = req.params;
    const row = db.prepare(
      'SELECT sub_id, expires_at FROM upload_tokens WHERE token = ?'
    ).get(token);

    if (!row) return res.status(404).json({ error: 'Upload link not found.' });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This upload link has expired.' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE upload_tokens SET used_at = ? WHERE token = ?').run(now, token);
    db.prepare('UPDATE submissions SET upload_completed_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.sub_id);

    return res.json({ success: true, message: 'Upload complete. Thank you — we\'ll be in touch soon.' });
  } catch (err) {
    console.error('[POST /api/upload/:token/complete]', err);
    return res.status(500).json({ error: 'Could not record upload completion.' });
  }
});

// ─── 404 FALLBACK ─────────────────────────────────────────────────────────────
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
  const emailStatus = resendClient  ? '✓ Resend configured'  : '✗ Email disabled (set RESEND_API_KEY)';
  const r2Status    = r2Client      ? '✓ R2 configured'      : '✗ Uploads disabled (set R2_* vars)';
  const discordSubs = CONFIG.SUBMISSIONS_WEBHOOK ? '✓' : '✗ (set SUBMISSIONS_WEBHOOK)';
  const discordNl   = CONFIG.NEWSLETTER_WEBHOOK  ? '✓' : '✗ (set NEWSLETTER_WEBHOOK)';
  console.log(`
╔══════════════════════════════════════════════════╗
║         REVELE MAGAZINE — API Server             ║
╠══════════════════════════════════════════════════╣
║  URL        http://localhost:${CONFIG.PORT}               ║
║  DB         ${CONFIG.DB_PATH.slice(-36).padEnd(36)}  ║
╠══════════════════════════════════════════════════╣
║  Email      ${emailStatus.padEnd(36)}  ║
║  Uploads    ${r2Status.padEnd(36)}    ║
║  Discord↑   ${discordSubs.padEnd(36)}    ║
║  Discord↑   ${discordNl.padEnd(36)}    ║
╠══════════════════════════════════════════════════╣
║  ENDPOINTS:                                      ║
║  POST   /api/submit                              ║
║  GET    /api/track/:email                        ║
║  GET    /api/count                               ║
║  POST   /api/newsletter                          ║
║  GET    /api/newsletter/unsubscribe              ║
║  POST   /api/admin/login                         ║
║  GET    /api/admin/subs                          ║
║  PATCH  /api/admin/subs/:id                      ║
║  DELETE /api/admin/subs/:id                      ║
║  GET    /api/admin/stats                         ║
║  POST   /api/admin/subs/:id/upload-link          ║
║  GET    /api/upload/:token                       ║
║  POST   /api/upload/:token/presign               ║
║  POST   /api/upload/:token/complete              ║
╚══════════════════════════════════════════════════╝
  `);
});
