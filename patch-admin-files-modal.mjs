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

// 1. Insert an "Images" field placeholder into the modal, right before "Internal Notes"
const oldStr1 = `'<div class="modal-field"><div class="modal-lbl">Internal Notes</div>`;
const newStr1 = `'<div class="modal-field"><div class="modal-lbl">Images</div><div id="modal-files-grid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">Loading…</div></div>' +
      '<div class="modal-field"><div class="modal-lbl">Internal Notes</div>`;
content = replaceOnce(content, oldStr1, newStr1, "images-field");

// 2. Trigger the file fetch right after the modal is shown
const oldStr2 = `document.getElementById('modal-overlay').classList.add('open');`;
const newStr2 = `document.getElementById('modal-overlay').classList.add('open');
    loadSubmissionFiles(sub.id);`;
content = replaceOnce(content, oldStr2, newStr2, "trigger-load");

// 3. Add the new loadSubmissionFiles() function right after viewSubDetail() ends
const oldStr3 = `} catch (err) { console.error('[Admin] View detail failed:', err); }
}`;
const newStr3 = `} catch (err) { console.error('[Admin] View detail failed:', err); }
}

async function loadSubmissionFiles(id) {
  if (!adminToken) return;
  const grid = document.getElementById('modal-files-grid');
  if (!grid) return;
  try {
    const res = await fetch(\`\${API}/api/admin/subs/\${encodeURIComponent(id)}/files\`, { headers: { 'Authorization': \`Bearer \${adminToken}\` } });
    const data = await res.json();
    if (!res.ok || !data.files || !data.files.length) { grid.innerHTML = '<span style="font-size:0.7rem;color:var(--text-3)">No images found.</span>'; return; }
    grid.innerHTML = data.files.map(f => \`<a href="\${f.url}" target="_blank" rel="noopener"><img src="\${f.url}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:1px solid var(--border)"></a>\`).join('');
  } catch (err) { console.error('[Admin] Load files failed:', err); grid.innerHTML = '<span style="font-size:0.7rem;color:var(--err)">Failed to load images.</span>'; }
}`;
content = replaceOnce(content, oldStr3, newStr3, "new-function");

writeFileSync(path, content, "utf8");
console.log("Patched successfully.");
