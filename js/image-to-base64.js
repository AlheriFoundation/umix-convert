(() => {
  'use strict';
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const formats = new Map([['jpg', { name: 'JPEG', mime: 'image/jpeg' }], ['jpeg', { name: 'JPEG', mime: 'image/jpeg' }], ['png', { name: 'PNG', mime: 'image/png' }], ['webp', { name: 'WebP', mime: 'image/webp' }]]);
  const state = { file: null, url: null, token: 0, busy: false, raw: '', uri: '' };
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  if (!zone || !input) { if (errorBox) showError('This tool could not initialize. Please refresh the page and try again.'); return; }
  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  zone.addEventListener('click', () => { if (!state.busy) input.click(); });
  zone.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) processFiles([...event.dataTransfer.files]); });
  input.addEventListener('change', event => processFiles([...event.target.files]));
  $('[data-replace]').addEventListener('click', () => { if (!state.busy) { resetTool(); input.click(); } });
  $('[data-copy-raw]').addEventListener('click', () => copyText(state.raw, $('[data-copy-raw]')));
  $('[data-copy-uri]').addEventListener('click', () => copyText(state.uri, $('[data-copy-uri]')));
  $('[data-download-raw]').addEventListener('click', () => downloadText(state.raw, '-base64.txt'));
  $('[data-download-uri]').addEventListener('click', () => downloadText(state.uri, '-data-uri.txt'));
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => { if (!state.busy) resetTool(); }));

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; $('[data-status]').textContent = message; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(value) { if (value < 1024) return `${value} Bytes`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(1)} MB`; }
  function extension(name) { const match = name.toLowerCase().match(/\.([a-z0-9]+)$/); return match ? match[1] : ''; }
  function formatFor(file) { return formats.get(extension(file.name)); }
  function validate(file) { if (!file) return 'Please select a JPG, JPEG, PNG, or WebP image.'; const format = formatFor(file); if (!format || (file.type && file.type !== format.mime && file.type !== 'application/octet-stream')) return 'Please select a supported JPG, PNG, or WebP image file.'; if (!file.size) return 'This image is empty or invalid.'; if (file.size > MAX_FILE_SIZE) return 'This image is larger than the 25 MB limit.'; return ''; }
  function safeBase(name) { return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'image'; }
  function revokeUrl() { if (state.url) URL.revokeObjectURL(state.url); state.url = null; }
  function readAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('read')); reader.onabort = () => reject(new Error('abort')); reader.readAsDataURL(file); }); }
  async function processFiles(files) {
    if (state.busy) return; clearError(); input.value = ''; if (files.length > 1) { showError('Please select one image at a time.'); return; } const problem = validate(files[0]); if (problem) { showError(problem); return; }
    resetTool(); state.busy = true; const token = ++state.token; state.file = files[0]; state.url = URL.createObjectURL(state.file); $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} Â· Reading imageâ€¦`; $('[data-file-summary]').hidden = false; zone.hidden = true; $('[data-processing]').hidden = false; $('[data-status]').textContent = 'Reading imageâ€¦';
    try { const dataUri = await readAsDataUrl(state.file); if (token !== state.token) return; const comma = dataUri.indexOf(','); if (comma < 0) throw new Error('format'); const format = formatFor(state.file); state.raw = dataUri.slice(comma + 1); state.uri = `data:${format.mime};base64,${state.raw}`; $('[data-preview]').src = state.url; $('[data-preview]').alt = `Preview of ${state.file.name}`; $('[data-result-name]').textContent = state.file.name; $('[data-result-meta]').textContent = `${format.name} Â· ${state.file.type || format.mime} Â· ${formatBytes(state.file.size)}`; $('[data-raw-output]').value = state.raw; $('[data-uri-output]').value = state.uri; $('[data-raw-count]').textContent = `Base64 characters: ${state.raw.length.toLocaleString()}`; $('[data-uri-count]').textContent = `Data URI characters: ${state.uri.length.toLocaleString()}`; $('[data-processing]').hidden = true; $('[data-result]').hidden = false; $('[data-status]').textContent = 'Conversion complete.'; }
    catch (error) { if (token !== state.token) return; resetTool(); showError('The image could not be converted to Base64. Please try another valid image.'); }
    finally { state.busy = false; $('[data-processing]').hidden = true; }
  }
  async function copyText(value, button) { if (!value) return; const original = button.textContent; try { if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value); else { const output = button.closest('.base64-output-block').querySelector('textarea'); output.focus(); output.select(); if (!document.execCommand('copy')) throw new Error('copy'); } button.textContent = 'Copied!'; setTimeout(() => { button.textContent = original; }, 1400); } catch (error) { showError('Copying failed. Select the output text and copy it manually.'); } }
  function downloadText(value, suffix) { if (!value || !state.file) return; try { const blob = new Blob([value], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${safeBase(state.file.name)}${suffix}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { showError('The text file could not be downloaded.'); } }
  function resetTool() { state.token += 1; revokeUrl(); state.file = null; state.raw = ''; state.uri = ''; input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-result]').hidden = true; $('[data-processing]').hidden = true; $('[data-preview]').removeAttribute('src'); $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-result-name]').textContent = ''; $('[data-result-meta]').textContent = ''; $('[data-raw-output]').value = ''; $('[data-uri-output]').value = ''; $('[data-raw-count]').textContent = 'Base64 characters: 0'; $('[data-uri-count]').textContent = 'Data URI characters: 0'; $('[data-status]').textContent = 'Choose an image to begin.'; clearError(); }
})();

