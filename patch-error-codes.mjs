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

// Submission form: include status code in the network-failure message
const oldStr1 = `} catch (err) { statusEl.className = 'f-status err'; statusEl.textContent = err.message === 'Upload failed' ? 'One or more images failed to upload. Please try again.' : 'Could not reach the server. Please ensure the backend is running, or email submissions@revelemagazine.com directly.'; }`;
const newStr1 = `} catch (err) { statusEl.className = 'f-status err'; const code = err.status ? \` (Error \${err.status})\` : ''; statusEl.textContent = (err.message === 'Upload failed' ? 'One or more images failed to upload. Please try again.' : 'Could not reach the server. Please ensure the backend is running, or email submissions@revelemagazine.com directly.') + code; }`;
content = replaceOnce(content, oldStr1, newStr1, "submit-error");

// deleteSubmissionFiles: include status code in the alert
const oldStr2 = `if (!res.ok) { alert('Failed to delete files.'); return; }`;
const newStr2 = `if (!res.ok) { alert(\`Failed to delete files. (Error \${res.status})\`); return; }`;
content = replaceOnce(content, oldStr2, newStr2, "delete-files-error");

// loadSubmissionFiles: include status code in the grid error message
const oldStr3 = `if (!res.ok || !data.files || !data.files.length) { grid.innerHTML = '<span style="font-size:0.7rem;color:var(--text-3)">No images found.</span>'; return; }`;
const newStr3 = `if (!res.ok) { grid.innerHTML = \`<span style="font-size:0.7rem;color:var(--err)">Failed to load images. (Error \${res.status})</span>\`; return; }
    if (!data.files || !data.files.length) { grid.innerHTML = '<span style="font-size:0.7rem;color:var(--text-3)">No images found.</span>'; return; }`;
content = replaceOnce(content, oldStr3, newStr3, "load-files-error");

writeFileSync(path, content, "utf8");
console.log("Patched successfully.");
