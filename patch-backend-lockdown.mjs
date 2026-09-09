import { readFileSync, writeFileSync } from "fs";

const path = "artifacts/revele-web/index.html";
let content = readFileSync(path, "utf8");

function replaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count !== 1) {
    console.error(`[${label}] Expected exactly 1 match, found ${count}. Aborting.`);
    process.exit(1);
  }
  return content.replace(oldStr, newStr);
}

// 1. Replace checkBackend()/showBackendBanner() with a version that also locks down submissions + newsletter
const oldStr1 = `async function checkBackend() {
  try {
    const res = await fetch(\`\${API}/api/count\`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('sub-counter').textContent = data.count;
      document.getElementById('backend-banner').classList.remove('show');
    } else { showBackendBanner(); }
  } catch { showBackendBanner(); document.getElementById('sub-counter').textContent = '—'; }
}
function showBackendBanner() { document.getElementById('backend-banner').classList.add('show'); }`;

const newStr1 = `let backendDown = false;
let ORIGINAL_SUB_CLOSED_HTML = null;
async function checkBackend() {
  try {
    const res = await fetch(\`\${API}/api/count\`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('sub-counter').textContent = data.count;
      document.getElementById('backend-banner').classList.remove('show');
      backendDown = false;
      setSubmitLockdown(false);
    } else { showBackendBanner(); backendDown = true; setSubmitLockdown(true); }
  } catch { showBackendBanner(); document.getElementById('sub-counter').textContent = '—'; backendDown = true; setSubmitLockdown(true); }
}
function showBackendBanner() { document.getElementById('backend-banner').classList.add('show'); }
function setSubmitLockdown(down) {
  const banner = document.getElementById('sub-closed-banner');
  const formCard = document.getElementById('sub-form-card');
  const nlEmail = document.getElementById('nl-email');
  if (banner && ORIGINAL_SUB_CLOSED_HTML === null) ORIGINAL_SUB_CLOSED_HTML = banner.innerHTML;
  if (down) {
    if (banner) {
      banner.innerHTML = '<h2 style="font-family:\\'Cormorant Garamond\\',serif;font-size:1.35rem;font-weight:300;font-style:italic;margin-bottom:12px">Submissions temporarily unavailable.</h2><p style="font-size:0.76rem;font-weight:300;color:var(--text-2);line-height:1.85">We are experiencing a technical issue on our end. Please check back shortly, or email <a href="mailto:submissions@revelemagazine.com" style="color:var(--gold)">submissions@revelemagazine.com</a> directly.</p>';
      banner.classList.add('show');
    }
    if (formCard) formCard.style.display = 'none';
    if (nlEmail) nlEmail.disabled = true;
  } else {
    if (banner && ORIGINAL_SUB_CLOSED_HTML !== null) banner.innerHTML = ORIGINAL_SUB_CLOSED_HTML;
    if (nlEmail) nlEmail.disabled = false;
    checkDeadline();
  }
}`;
content = replaceOnce(content, oldStr1, newStr1, "checkBackend");

// 2. Guard nlSubmit() so it short-circuits cleanly while the backend is down
const oldStr2 = `async function nlSubmit() {
  const emailEl = document.getElementById('nl-email');`;
const newStr2 = `async function nlSubmit() {
  if (backendDown) { const m = document.getElementById('nl-msg'); if (m) { m.textContent = 'Newsletter signups are temporarily unavailable.'; m.className = 'nl-msg err'; m.style.display = 'block'; } return; }
  const emailEl = document.getElementById('nl-email');`;
content = replaceOnce(content, oldStr2, newStr2, "nlSubmit-guard");

writeFileSync(path, content, "utf8");
console.log("Patched successfully.");
