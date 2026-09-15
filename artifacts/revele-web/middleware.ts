/// <reference lib="dom" />
// Vercel Routing Middleware.
// Runs on every page request (not on /assets/* or files with an extension —
// see the matcher below) and rewrites the static index.html's <title> and
// og:/twitter: meta tags to match the page actually being requested, so link
// previews in iMessage, WhatsApp, Slack, X, etc. show the right thing instead
// of always showing the homepage.
//
// This only ever changes <head> meta tags in the HTML text. It does not
// change how the site behaves for real visitors — the same client-side JS
// app loads and takes over exactly as before.

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api/|assets/|.*\\.[^/]+$).*)"],
};

const DEFAULT_IMAGE_PATH = "/assets/issue-01-cover.jpg";
const API_BASE = "https://revele-magazine.onrender.com";

type PageMeta = { title: string; description: string };

const PAGES: Record<string, PageMeta> = {
  "/": {
    title: "Révèle — Visual Arts Magazine",
    description:
      "Révèle is a visual arts magazine dedicated to the story behind the image. Open submissions for Issue 01: The First Gaze.",
  },
  "/about": {
    title: "About — Révèle",
    description:
      "Révèle is dedicated to the story that lives behind the photograph — the moment before the shutter, the world the photographer carried into the frame, the silence after.",
  },
  "/issues": {
    title: "Issues — Révèle",
    description:
      "Browse the issues of Révèle, a visual arts magazine built around the stories behind the image.",
  },
  "/mood": {
    title: "Mood — Révèle",
    description:
      "A visual mood board of the tone and texture Révèle is drawn to: the quiet, the overlooked, the tender.",
  },
  "/submit": {
    title: "Submit — Révèle",
    description:
      "Submit your photography, and the story behind it, for consideration in an upcoming issue of Révèle.",
  },
  "/faq": {
    title: "FAQ — Révèle",
    description:
      "Answers to common questions about submitting to, and being featured in, Révèle.",
  },
  "/contact": {
    title: "Contact — Révèle",
    description: "Get in touch with the Révèle editorial team.",
  },
  "/press": {
    title: "Press — Révèle",
    description: "Press and media resources for Révèle, a visual arts magazine.",
  },
  "/opencall": {
    title: "Open Call — Révèle",
    description:
      "Révèle's current open call for submissions — theme, requirements, and deadline.",
  },
  "/featured": {
    title: "Featured — Révèle",
    description:
      "Editorial features from photographers whose work has been selected for Révèle, each with the full story behind the series.",
  },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectMeta(
  html: string,
  meta: { title: string; description: string; image: string; url: string },
): string {
  const safeTitle = escapeHtml(meta.title);
  const safeDesc = escapeHtml(meta.description.slice(0, 200));

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${safeTitle}</title>`);
  html = html.replace(
    /<meta name="description" content="[\s\S]*?">/,
    `<meta name="description" content="${safeDesc}">`,
  );
  html = html.replace(
    /<meta property="og:title" content="[\s\S]*?">/,
    `<meta property="og:title" content="${safeTitle}">`,
  );
  html = html.replace(
    /<meta property="og:description" content="[\s\S]*?">/,
    `<meta property="og:description" content="${safeDesc}">`,
  );
  html = html.replace(
    /<meta property="og:image" content="[\s\S]*?">/,
    `<meta property="og:image" content="${meta.image}">`,
  );
  html = html.replace(
    /<meta property="og:url" content="[\s\S]*?">/,
    `<meta property="og:url" content="${meta.url}">`,
  );
  html = html.replace(
    /<meta name="twitter:title" content="[\s\S]*?">/,
    `<meta name="twitter:title" content="${safeTitle}">`,
  );
  html = html.replace(
    /<meta name="twitter:description" content="[\s\S]*?">/,
    `<meta name="twitter:description" content="${safeDesc}">`,
  );
  html = html.replace(
    /<meta name="twitter:image" content="[\s\S]*?">/,
    `<meta name="twitter:image" content="${meta.image}">`,
  );
  return html;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const origin = url.origin;
  const defaultImage = `${origin}${DEFAULT_IMAGE_PATH}`;

  let html: string;
  try {
    const staticRes = await fetch(new URL("/index.html", origin));
    if (!staticRes.ok) return undefined; // let Vercel's normal handling take over
    html = await staticRes.text();
  } catch {
    return undefined;
  }

  const featuredMatch = path.match(/^\/featured\/(.+)$/);
  if (featuredMatch) {
    const id = decodeURIComponent(featuredMatch[1]);
    try {
      const itemRes = await fetch(
        `${API_BASE}/api/featured/${encodeURIComponent(id)}`,
        { signal: AbortSignal.timeout(2500) },
      );
      if (itemRes.ok) {
        const data = await itemRes.json();
        const item = data.item;
        const title = `${item.series} — Révèle`;
        const description =
          (item.story || "").trim() ||
          `By ${item.photographer}, featured in Révèle.`;
        const image =
          (item.imageUrls && item.imageUrls[0]) || defaultImage;
        html = injectMeta(html, { title, description, image, url: url.toString() });
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    } catch {
      // fall through to default /featured meta below on any error or timeout
    }
    const fallback = PAGES["/featured"];
    html = injectMeta(html, {
      title: fallback.title,
      description: fallback.description,
      image: defaultImage,
      url: url.toString(),
    });
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const meta = PAGES[path] || PAGES["/"];
  html = injectMeta(html, {
    title: meta.title,
    description: meta.description,
    image: defaultImage,
    url: url.toString(),
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
