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

// 1. Add a "Delete files" button next to the Images label
const oldStr1 = `'<div class="modal-field"><div class="modal-lbl">Images</div><div id="modal-files-grid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">Loading…</div></div>' +`;
const newStr1 = `'<div class="modal-field"><div class="modal-lbl" style="display:flex;align-items:center;justify-content:space-between">Images<button class="admin-del-btn" data-subid="' + escHtml(sub.id) + '" onclick="deleteSubmissionFiles(this.dataset.subid)">Delete files</button></div><div id="modal-files-grid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">Loading…</div></div>' +`;
content = replaceOnce(content, oldStr1, newStr1, "delete-button");

// 2. Add the deleteSubmissionFiles() function right after loadSubmissionFiles()
const oldStr2 = `} catch (err) { console.error('[Admin] Load files failed:', err); grid.innerHTML = '<span style="font-size:0.7rem;color:var(--err)">Failed to load images.</span>'; }
}`;
const newStr2 = `} catch (err) { console.error('[Admin] Load files failed:', err); grid.innerHTML = '<span style="font-size:0.7rem;color:var(--err)">Failed to load images.</span>'; }
}

async function deleteSubmissionFiles(id) {
  if (!adminToken) return;
  if (!confirm('Permanently delete all uploaded images for this submission from storage? This cannot be undone.')) return;
  const grid = document.getElementById('modal-files-grid');
  try {
    const res = await fetch(\`\${API}/api/admin/subs/\${encodeURIComponent(id)}/files\`, { method: 'DELETE', headers: { 'Authorization': \`Bearer \${adminToken}\` } });
    if (!res.ok) { alert('Failed to delete files.'); return; }
    if (grid) grid.innerHTML = '<span style="font-size:0.7rem;color:var(--text-3)">Files deleted.</span>';
  } catch (err) { console.error('[Admin] Delete files failed:', err); alert('Failed to delete files.'); }
}`;
content = replaceOnce(content, oldStr2, newStr2, "delete-function");

writeFileSync(path, content, "utf8");
console.log("Patched successfully.");
