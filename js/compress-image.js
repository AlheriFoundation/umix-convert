(() => {
  'use strict';
  const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
  const MAX_FILES = 50;
  const formats = new Map([
    ['jpg', { input: 'image/jpeg', output: 'image/jpeg', ext: 'jpg' }],
    ['jpeg', { input: 'image/jpeg', output: 'image/jpeg', ext: 'jpg' }],
    ['png', { input: 'image/png', output: 'image/png', ext: 'png' }],
    ['webp', { input: 'image/webp', output: 'image/webp', ext: 'webp' }]
  ]);
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const state = { items: [], results: [], zipUrl: null, busy: false, token: 0 };
  if (!zone || !input || !window.JSZip) { if (errorBox) showError('This tool could not initialize. Please refresh the page and try again.'); return; }
  const quality = $('[data-quality]');
  quality.addEventListener('input', () => { $('[data-quality-value]').textContent = `${quality.value}%`; });
  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  $('[data-add-more]').addEventListener('click', () => { if (!state.busy) input.click(); });
  input.addEventListener('change', event => addFiles([...event.target.files]));
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) addFiles([...event.dataTransfer.files]); });
  $('[data-compress]').addEventListener('click', processFiles);
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => { if (!state.busy) resetTool(); }));
  $('[data-download-all]').addEventListener('click', downloadAll);

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function extension(name) { const match = name.toLowerCase().match(/\.([a-z0-9]+)$/); return match ? match[1] : ''; }
  function typeOf(file) { return formats.get(extension(file.name)); }
  function totalBytes(items = state.items) { return items.reduce((sum, item) => sum + item.file.size, 0); }
  function bytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function safeStem(name) { return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'image'; }
  function dimensions(item) { return `${item.width} × ${item.height}px`; }
  function uniqueName(stem, ext, used) { let name = `${stem}-compressed.${ext}`; let n = 2; while (used.has(name)) name = `${stem}-compressed-${n++}.${ext}`; used.add(name); return name; }
  function validate(files) {
    if (!files.length) return 'Please select at least one JPG, PNG or WebP image.';
    if (state.items.length + files.length > MAX_FILES) return `You can select up to ${MAX_FILES} images.`;
    for (const file of files) { const format = typeOf(file); if (!format || file.type !== format.input) return 'Unsupported file. Please choose JPG, JPEG, PNG or WebP files with the matching extension.'; if (!file.size) return 'One or more selected files are empty or invalid.'; }
    if (totalBytes() + files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) return 'The selected images exceed the 25 MB total size limit.';
    return '';
  }
  async function addFiles(files) {
    if (state.busy) return; clearError(); input.value = ''; const problem = validate(files); if (problem) { showError(problem); return; }
    state.busy = true; const token = ++state.token; const loaded = [];
    try { for (const file of files) loaded.push(await loadImage(file)); if (token !== state.token) { cleanup(loaded); return; } state.items.push(...loaded); invalidateResults(); renderInput(); }
    catch (error) { cleanup(loaded); showError('We could not decode one or more images. Please try another valid image file.'); }
    finally { state.busy = false; }
  }
  function loadImage(file) { return new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const image = new Image(); image.decoding = 'async'; image.onload = () => resolve({ file, url, image, width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => { image.src = ''; URL.revokeObjectURL(url); reject(new Error('decode')); }; image.src = url; }); }
  function renderInput() {
    const panel = $('[data-input-panel]'); panel.hidden = !state.items.length; zone.hidden = state.items.length > 0; $('[data-converter-actions]').hidden = !state.items.length || state.results.length > 0; $('[data-file-count]').textContent = state.items.length;
    const fragment = document.createDocumentFragment(); state.items.forEach(item => { const row = document.createElement('article'); row.className = 'image-file-row'; const image = document.createElement('img'); image.src = item.url; image.alt = `Preview of ${item.file.name}`; image.width = 88; image.height = 66; const details = document.createElement('div'); details.className = 'image-file-details'; const name = document.createElement('strong'); name.textContent = item.file.name; const meta = document.createElement('span'); meta.textContent = `${typeOf(item.file).ext.toUpperCase()} · ${dimensions(item)} · ${bytes(item.file.size)}`; details.append(name, meta); row.append(image, details); fragment.append(row); }); $('[data-image-list]').replaceChildren(fragment);
  }
  function canEncode(mime) { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; return canvas.toDataURL(mime).startsWith(`data:${mime}`); }
  function canvasBlob(item, mime, qualityValue) { return new Promise((resolve, reject) => { const canvas = document.createElement('canvas'); canvas.width = item.width; canvas.height = item.height; const context = canvas.getContext('2d'); if (!context) { reject(new Error('canvas')); return; } context.drawImage(item.image, 0, 0); canvas.toBlob(blob => { canvas.width = canvas.height = 1; if (!blob || blob.type !== mime) reject(new Error('encode')); else resolve(blob); }, mime, qualityValue); }); }
  async function compress(item) { const format = typeOf(item.file); if (format.output === 'image/webp' && !canEncode(format.output)) throw new Error('webp'); return canvasBlob(item, format.output, format.output === 'image/png' ? undefined : Number(quality.value) / 100); }
  function yieldBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }
  async function processFiles() {
    if (!state.items.length || state.busy) return; clearError(); state.busy = true; $('[data-converter-actions]').hidden = true; $('[data-results-panel]').hidden = true; $('[data-processing-panel]').hidden = false; revokeResults(); state.results = [];
    const progress = $('[data-progress-bar]'); const track = progress.parentElement; const label = $('[data-processing-label]'); const count = $('[data-processing-count]'); const used = new Set();
    try { for (let index = 0; index < state.items.length; index += 1) { const item = state.items[index]; label.textContent = `Compressing ${index + 1} of ${state.items.length} images…`; count.textContent = `${index} of ${state.items.length} complete`; const percent = Math.round(index / state.items.length * 100); progress.style.width = `${percent}%`; track.setAttribute('aria-valuenow', percent); const blob = await compress(item); const format = typeOf(item.file); state.results.push({ item, blob, url: URL.createObjectURL(blob), name: uniqueName(safeStem(item.file.name), format.ext, used), width: item.width, height: item.height }); await yieldBrowser(); } progress.style.width = '100%'; track.setAttribute('aria-valuenow', '100'); label.textContent = `${state.results.length} ${state.results.length === 1 ? 'image' : 'images'} compressed successfully.`; count.textContent = ''; renderResults(); $('[data-results-panel]').hidden = false; }
    catch (error) { revokeResults(); state.results = []; showError(error.message === 'webp' ? 'This browser cannot encode WebP reliably. Please use another format or browser.' : 'We could not compress one or more images. Please try another valid image file.'); $('[data-converter-actions]').hidden = false; }
    finally { state.busy = false; $('[data-processing-panel]').hidden = true; }
  }
  function renderResults() {
    const fragment = document.createDocumentFragment(); state.results.forEach(result => { const card = document.createElement('article'); card.className = 'compress-result-card'; const previews = document.createElement('div'); previews.className = 'compress-previews'; const original = document.createElement('img'); original.src = result.item.url; original.alt = `Original preview of ${result.item.file.name}`; const compressed = document.createElement('img'); compressed.src = result.url; compressed.alt = `Compressed preview of ${result.name}`; previews.append(original, compressed); const body = document.createElement('div'); body.className = 'compress-result-body'; const title = document.createElement('h3'); title.textContent = result.name; const meta = document.createElement('p'); meta.textContent = `${typeOf(result.item.file).ext.toUpperCase()} · ${dimensions(result)}`; const sizes = document.createElement('p'); sizes.textContent = `Original: ${bytes(result.item.file.size)} · Compressed: ${bytes(result.blob.size)}`; const saved = document.createElement('p'); saved.className = result.blob.size < result.item.file.size ? 'saved' : 'not-saved'; saved.textContent = result.blob.size < result.item.file.size ? `Saved: ${((1 - result.blob.size / result.item.file.size) * 100).toFixed(1)}%` : 'Compression did not reduce this file size.'; const link = document.createElement('a'); link.className = 'button button-secondary'; link.href = result.url; link.download = result.name; link.textContent = 'Download'; link.setAttribute('aria-label', `Download ${result.name}`); body.append(title, meta, sizes, saved, link); card.append(previews, body); fragment.append(card); }); $('[data-results-grid]').replaceChildren(fragment);
  }
  async function downloadAll() { if (!state.results.length || state.busy) return; const button = $('[data-download-all]'); state.busy = true; button.disabled = true; button.textContent = 'Preparing ZIP…'; try { const zip = new JSZip(); state.results.forEach(result => zip.file(result.name, result.blob)); revokeZip(); state.zipUrl = URL.createObjectURL(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })); const link = document.createElement('a'); link.href = state.zipUrl; link.download = 'compressed-images.zip'; link.click(); const url = state.zipUrl; setTimeout(() => { if (state.zipUrl === url) revokeZip(); }, 1000); } catch (error) { showError('The ZIP could not be created. Please download the compressed images individually.'); } finally { state.busy = false; button.disabled = false; button.textContent = 'Download All ZIP'; } }
  function cleanup(items) { items.forEach(item => { item.image.src = ''; URL.revokeObjectURL(item.url); }); }
  function revokeResults() { state.results.forEach(result => URL.revokeObjectURL(result.url)); }
  function revokeZip() { if (state.zipUrl) URL.revokeObjectURL(state.zipUrl); state.zipUrl = null; }
  function invalidateResults() { revokeResults(); state.results = []; revokeZip(); $('[data-results-panel]').hidden = true; }
  function resetTool() { state.token += 1; cleanup(state.items); revokeResults(); revokeZip(); state.items = []; state.results = []; input.value = ''; $('[data-input-panel]').hidden = true; zone.hidden = false; $('[data-converter-actions]').hidden = true; $('[data-processing-panel]').hidden = true; $('[data-results-panel]').hidden = true; $('[data-image-list]').replaceChildren(); $('[data-results-grid]').replaceChildren(); $('[data-file-count]').textContent = '0'; $('[data-progress-bar]').style.width = '0%'; $('[data-progress-bar]').parentElement.setAttribute('aria-valuenow', '0'); clearError(); }
})();

