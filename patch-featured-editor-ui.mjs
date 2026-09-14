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

// 1. CSS for the image dropzone + thumbnail strip
const oldCss = `.featured-card-read::after { content: '→'; font-size: 0.8rem; letter-spacing: 0; }`;
const newCss = `.featured-card-read::after { content: '→'; font-size: 0.8rem; letter-spacing: 0; }
.featured-image-drop { margin-top:6px; border:1px dashed var(--border-2); border-radius:var(--radius-sm); padding:22px; text-align:center; cursor:pointer; font-size:0.68rem; color:var(--text-2); transition:border-color 0.2s, color 0.2s; }
.featured-image-drop:hover { border-color:rgba(200,160,106,0.5); color:var(--gold); }
.featured-image-thumbs { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
.featured-thumb { position:relative; width:78px; height:78px; border-radius:7px; overflow:hidden; border:1px solid var(--border); flex-shrink:0; background:var(--bg-3); }
.featured-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.featured-thumb-cover { position:absolute; top:4px; left:4px; background:var(--gold); color:#000; font-size:0.48rem; font-weight:600; padding:2px 6px; border-radius:3px; letter-spacing:0.06em; text-transform:uppercase; }
.featured-thumb-remove { position:absolute; top:4px; right:4px; width:17px; height:17px; border-radius:50%; background:rgba(0,0,0,0.7); color:#fff; font-size:0.7rem; line-height:1; display:flex; align-items:center; justify-content:center; cursor:pointer; }
.featured-thumb-move { position:absolute; bottom:4px; right:4px; display:flex; gap:2px; }
.featured-thumb-move button { width:16px; height:16px; border-radius:3px; background:rgba(0,0,0,0.7); color:#fff; font-size:0.6rem; display:flex; align-items:center; justify-content:center; cursor:pointer; border:none; }
.featured-editor-thumb { width:44px; height:44px; border-radius:6px; object-fit:cover; border:1px solid var(--border); flex-shrink:0; }`;
content = replaceOnce(content, oldCss, newCss, "css");

// 2. Add the Images field to the "New entry" form
const oldForm = `<div style="margin-bottom:12px"><label class="form-label">Team credits *</label><textarea class="form-input" id="nf-credits" placeholder="Photographer: Name&#10;Stylist: Name" style="margin-top:4px;min-height:80px;resize:vertical"></textarea></div>`;
const newForm = `<div style="margin-bottom:12px">
            <label class="form-label">Images <span style="font-weight:300;color:var(--text-3);text-transform:none;letter-spacing:normal">— first image becomes the cover</span></label>
            <div class="featured-image-drop" id="nf-image-drop" onclick="document.getElementById('nf-image-input').click()"><span id="nf-image-drop-label">Click to upload images (JPG, PNG, or WEBP)</span></div>
            <input type="file" id="nf-image-input" accept="image/jpeg,image/png,image/webp" multiple style="display:none" onchange="handleNfImageUpload(this.files)">
            <div class="featured-image-thumbs" id="nf-image-thumbs"></div>
          </div>
          <div style="margin-bottom:12px"><label class="form-label">Team credits *</label><textarea class="form-input" id="nf-credits" placeholder="Photographer: Name&#10;Stylist: Name" style="margin-top:4px;min-height:80px;resize:vertical"></textarea></div>`;
content = replaceOnce(content, oldForm, newForm, "form-html");

// 3. Insert the image-handling JS block right before createFeaturedEntry()
const oldFnAnchor = `async function createFeaturedEntry() {`;
const newFnBlock = `let nfImages = [];
let efImages = [];
let efEditingId = null;
let _adminFeaturedCache = {};

function renderImageThumbs(containerId, images, removeFn, moveFn) {
  const el = document.getElementById(containerId); if (!el) return;
  el.innerHTML = images.map(function(img, i) {
    return '<div class="featured-thumb"><img src="' + img.url + '">' +
      (i === 0 ? '<span class="featured-thumb-cover">Cover</span>' : '') +
      '<span class="featured-thumb-remove" onclick="' + removeFn + '(' + i + ')">\u00d7</span>' +
      '<div class="featured-thumb-move">' +
      (i > 0 ? '<button onclick="' + moveFn + '(' + i + ',-1)">\u2039</button>' : '') +
      (i < images.length - 1 ? '<button onclick="' + moveFn + '(' + i + ',1)">\u203a</button>' : '') +
      '</div></div>';
  }).join('');
}

async function uploadFeaturedImage(file) {
  const presignRes = await fetch(\`\${API}/api/admin/featured/upload-url\`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${adminToken}\` }, body: JSON.stringify({ filename: file.name, contentType: file.type, fileSize: file.size }) });
  const presignData = await presignRes.json();
  if (!presignRes.ok) throw new Error(presignData.error || 'Failed to get upload URL');
  const putRes = await fetch(presignData.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!putRes.ok) throw new Error('Upload failed');
  return { key: presignData.fileKey, url: URL.createObjectURL(file) };
}

async function handleNfImageUpload(files) {
  const drop = document.getElementById('nf-image-drop-label'); if (drop) drop.textContent = 'Uploading\u2026';
  try { for (const file of files) { const img = await uploadFeaturedImage(file); nfImages.push(img); } }
  catch (err) { console.error('[handleNfImageUpload]', err); alert('Failed to upload one or more images.'); }
  if (drop) drop.textContent = 'Click to upload images (JPG, PNG, or WEBP)';
  renderImageThumbs('nf-image-thumbs', nfImages, 'removeNfImage', 'moveNfImage');
}
function removeNfImage(i) { nfImages.splice(i, 1); renderImageThumbs('nf-image-thumbs', nfImages, 'removeNfImage', 'moveNfImage'); }
function moveNfImage(i, dir) { const j = i + dir; if (j < 0 || j >= nfImages.length) return; const t = nfImages[i]; nfImages[i] = nfImages[j]; nfImages[j] = t; renderImageThumbs('nf-image-thumbs', nfImages, 'removeNfImage', 'moveNfImage'); }

async function handleEfImageUpload(files) {
  const drop = document.getElementById('ef-image-drop-label'); if (drop) drop.textContent = 'Uploading\u2026';
  try { for (const file of files) { const img = await uploadFeaturedImage(file); efImages.push(img); } }
  catch (err) { console.error('[handleEfImageUpload]', err); alert('Failed to upload one or more images.'); }
  if (drop) drop.textContent = 'Click to upload images (JPG, PNG, or WEBP)';
  renderImageThumbs('ef-image-thumbs', efImages, 'removeEfImage', 'moveEfImage');
}
function removeEfImage(i) { efImages.splice(i, 1); renderImageThumbs('ef-image-thumbs', efImages, 'removeEfImage', 'moveEfImage'); }
function moveEfImage(i, dir) { const j = i + dir; if (j < 0 || j >= efImages.length) return; const t = efImages[i]; efImages[i] = efImages[j]; efImages[j] = t; renderImageThumbs('ef-image-thumbs', efImages, 'removeEfImage', 'moveEfImage'); }

function openFeaturedImageEditor(id) {
  const entry = _adminFeaturedCache[id]; if (!entry) return;
  efEditingId = id;
  efImages = (entry.imageUrls || []).map(function(x) { return { key: x.key, url: x.url }; });
  document.getElementById('modal-content').innerHTML =
    '<div class="eyebrow" style="margin-bottom:14px">Edit images \u2014 ' + escHtml(entry.series) + '</div>' +
    '<div class="featured-image-drop" id="ef-image-drop" onclick="document.getElementById(\\'ef-image-input\\').click()"><span id="ef-image-drop-label">Click to upload images (JPG, PNG, or WEBP)</span></div>' +
    '<input type="file" id="ef-image-input" accept="image/jpeg,image/png,image/webp" multiple style="display:none" onchange="handleEfImageUpload(this.files)">' +
    '<div class="featured-image-thumbs" id="ef-image-thumbs"></div>' +
    '<div style="margin-top:18px;display:flex;gap:10px"><button class="btn btn-gold" style="font-size:0.6rem" onclick="saveFeaturedImages()">Save images</button><button class="btn btn-ghost" style="font-size:0.6rem" onclick="document.getElementById(\\'modal-overlay\\').classList.remove(\\'open\\')">Cancel</button></div>' +
    '<div id="ef-status" style="font-size:0.66rem;margin-top:10px;display:none"></div>';
  renderImageThumbs('ef-image-thumbs', efImages, 'removeEfImage', 'moveEfImage');
  document.getElementById('modal-overlay').classList.add('open');
}

async function saveFeaturedImages() {
  if (!efEditingId) return;
  const statusEl = document.getElementById('ef-status');
  try {
    const res = await fetch(\`\${API}/api/admin/featured/\${encodeURIComponent(efEditingId)}\`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${adminToken}\` }, body: JSON.stringify({ images: efImages.map(function(i) { return i.key; }) }) });
    if (res.ok) { document.getElementById('modal-overlay').classList.remove('open'); _featuredLoaded = false; loadAdminFeatured(); }
    else { const d = await res.json(); if (statusEl) { statusEl.textContent = d.error || 'Failed to save.'; statusEl.style.color = 'var(--err)'; statusEl.style.display = 'block'; } }
  } catch (err) { console.error('[saveFeaturedImages]', err); }
}

async function createFeaturedEntry() {`;
content = replaceOnce(content, oldFnAnchor, newFnBlock, "js-block");

// 4. Include images in the create-entry payload
const oldCreate = `const res = await fetch(\`\${API}/api/admin/featured\`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${adminToken}\` }, body: JSON.stringify({ series, photographer, instagram, issue, credits, story, status: publish ? 'published' : 'draft' }) });`;
const newCreate = `const res = await fetch(\`\${API}/api/admin/featured\`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${adminToken}\` }, body: JSON.stringify({ series, photographer, instagram, issue, credits, story, status: publish ? 'published' : 'draft', images: nfImages.map(function(i) { return i.key; }) }) });`;
content = replaceOnce(content, oldCreate, newCreate, "create-payload");

// 5. Reset nfImages after successful save
const oldReset = `if (res.ok) { statusEl.textContent = 'Entry saved.'; statusEl.style.color = 'var(--gold)'; statusEl.style.display = 'block'; g('new-featured-form').style.display = 'none'; _featuredLoaded = false; loadAdminFeatured(); }`;
const newReset = `if (res.ok) { statusEl.textContent = 'Entry saved.'; statusEl.style.color = 'var(--gold)'; statusEl.style.display = 'block'; g('new-featured-form').style.display = 'none'; nfImages = []; renderImageThumbs('nf-image-thumbs', nfImages, 'removeNfImage', 'moveNfImage'); _featuredLoaded = false; loadAdminFeatured(); }`;
content = replaceOnce(content, oldReset, newReset, "create-reset");

// 6. Reset nfImages when opening the form fresh
const oldOpen = `function openNewFeaturedForm() { const f = document.getElementById('new-featured-form'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; ['nf-series','nf-photographer','nf-instagram','nf-credits','nf-story'].forEach(function(id) { const el = document.getElementById(id); if (el) el.value = ''; }); const iss = document.getElementById('nf-issue'); if (iss) iss.value = 'Issue 01'; const pub = document.getElementById('nf-publish'); if (pub) pub.checked = false; const st = document.getElementById('nf-status'); if (st) st.style.display = 'none'; }`;
const newOpen = `function openNewFeaturedForm() { const f = document.getElementById('new-featured-form'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; ['nf-series','nf-photographer','nf-instagram','nf-credits','nf-story'].forEach(function(id) { const el = document.getElementById(id); if (el) el.value = ''; }); const iss = document.getElementById('nf-issue'); if (iss) iss.value = 'Issue 01'; const pub = document.getElementById('nf-publish'); if (pub) pub.checked = false; const st = document.getElementById('nf-status'); if (st) st.style.display = 'none'; nfImages = []; renderImageThumbs('nf-image-thumbs', nfImages, 'removeNfImage', 'moveNfImage'); }`;
content = replaceOnce(content, oldOpen, newOpen, "open-reset");

// 7. loadAdminFeatured: cache entries + show thumbnail + add "Edit images" button
const oldLoad = `async function loadAdminFeatured() {
  if (!adminToken) return;
  const container = document.getElementById('admin-featured-list'); if (!container) return;
  try {
    const res = await fetch(\`\${API}/api/admin/featured\`, { headers: { 'Authorization': \`Bearer \${adminToken}\` } });
    const data = await res.json();
    if (!res.ok || !data.featured || data.featured.length === 0) { container.innerHTML = '<div class="admin-empty" style="margin-top:0">No featured entries yet.</div>'; return; }
    container.innerHTML = '<div class="featured-editor-list">' + data.featured.map(function(f) { return '<div class="featured-editor-item"><div class="featured-editor-info"><div class="featured-editor-title">' + escHtml(f.series) + '</div><div class="featured-editor-meta">' + escHtml(f.photographer) + ' \u00b7 ' + escHtml(f.issue) + '</div></div><div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap"><span class="feat-badge ' + f.status + '">' + f.status + '</span><button class="btn btn-ghost" style="font-size:0.5rem;padding:5px 10px" data-fid="' + escHtml(f.id) + '" data-fstatus="' + f.status + '" onclick="toggleFeaturedStatus(this.dataset.fid,this.dataset.fstatus)">' + (f.status === 'published' ? 'Unpublish' : 'Publish') + '</button><button class="admin-del-btn" data-fid="' + escHtml(f.id) + '" data-fname="' + escHtml(f.series) + '" onclick="deleteFeaturedEntry(this.dataset.fid,this.dataset.fname)">Delete</button></div></div>'; }).join('') + '</div>';
  } catch (err) { console.error('[loadAdminFeatured]', err); }
}`;
const newLoad = `async function loadAdminFeatured() {
  if (!adminToken) return;
  const container = document.getElementById('admin-featured-list'); if (!container) return;
  try {
    const res = await fetch(\`\${API}/api/admin/featured\`, { headers: { 'Authorization': \`Bearer \${adminToken}\` } });
    const data = await res.json();
    _adminFeaturedCache = {};
    if (data.featured) data.featured.forEach(function(f) { _adminFeaturedCache[f.id] = f; });
    if (!res.ok || !data.featured || data.featured.length === 0) { container.innerHTML = '<div class="admin-empty" style="margin-top:0">No featured entries yet.</div>'; return; }
    container.innerHTML = '<div class="featured-editor-list">' + data.featured.map(function(f) {
      const thumb = (f.imageUrls && f.imageUrls.length) ? '<img class="featured-editor-thumb" src="' + f.imageUrls[0].url + '">' : '<div class="featured-editor-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.5rem;color:var(--text-3)">No image</div>';
      return '<div class="featured-editor-item">' + thumb + '<div class="featured-editor-info"><div class="featured-editor-title">' + escHtml(f.series) + '</div><div class="featured-editor-meta">' + escHtml(f.photographer) + ' \u00b7 ' + escHtml(f.issue) + '</div></div><div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap"><span class="feat-badge ' + f.status + '">' + f.status + '</span><button class="btn btn-ghost" style="font-size:0.5rem;padding:5px 10px" data-fid="' + escHtml(f.id) + '" onclick="openFeaturedImageEditor(this.dataset.fid)">Edit images</button><button class="btn btn-ghost" style="font-size:0.5rem;padding:5px 10px" data-fid="' + escHtml(f.id) + '" data-fstatus="' + f.status + '" onclick="toggleFeaturedStatus(this.dataset.fid,this.dataset.fstatus)">' + (f.status === 'published' ? 'Unpublish' : 'Publish') + '</button><button class="admin-del-btn" data-fid="' + escHtml(f.id) + '" data-fname="' + escHtml(f.series) + '" onclick="deleteFeaturedEntry(this.dataset.fid,this.dataset.fname)">Delete</button></div></div>';
    }).join('') + '</div>';
  } catch (err) { console.error('[loadAdminFeatured]', err); }
}`;
content = replaceOnce(content, oldLoad, newLoad, "load-featured");

writeFileSync(path, content, "utf8");
console.log("All edits patched successfully.");
