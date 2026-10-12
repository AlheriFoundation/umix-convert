(() => {
  'use strict';
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_ALPHA_PIXELS = 4 * 1024 * 1024;
  const formats = new Map([['jpg', { name: 'JPEG', mime: 'image/jpeg' }], ['jpeg', { name: 'JPEG', mime: 'image/jpeg' }], ['png', { name: 'PNG', mime: 'image/png' }], ['webp', { name: 'WebP', mime: 'image/webp' }]]);
  const state = { file: null, image: null, url: null, busy: false, token: 0 };
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
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) inspectFiles([...event.dataTransfer.files]); });
  input.addEventListener('change', event => inspectFiles([...event.target.files]));
  $('[data-replace]').addEventListener('click', () => { if (!state.busy) { resetTool(); input.click(); } });
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => { if (!state.busy) resetTool(); }));

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; $('[data-status]').textContent = message; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(value) { if (value < 1024) return `${value} Bytes`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(1)} MB`; }
  function extension(name) { const match = name.toLowerCase().match(/\.([a-z0-9]+)$/); return match ? match[1] : ''; }
  function formatFor(file) { return formats.get(extension(file.name)); }
  function validate(file) { if (!file) return 'Please select a JPG, JPEG, PNG, or WebP image.'; const format = formatFor(file); if (!format || (file.type && file.type !== format.mime && file.type !== 'application/octet-stream')) return 'Please select a supported JPG, PNG, or WebP image file.'; if (!file.size) return 'This image is empty or invalid.'; if (file.size > MAX_FILE_SIZE) return 'This image is larger than the 25 MB limit.'; return ''; }
  function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
  function aspectRatio(width, height) { const divisor = gcd(width, height); const simpleWidth = width / divisor; const simpleHeight = height / divisor; return simpleWidth <= 100 && simpleHeight <= 100 ? `${simpleWidth}:${simpleHeight}` : `${(width / height).toFixed(2)}:1`; }
  function loadImage(file, url, token) { return new Promise((resolve, reject) => { const image = new Image(); image.decoding = 'async'; image.onload = () => { if (token !== state.token) { reject(new Error('stale')); return; } if (!image.naturalWidth || !image.naturalHeight) reject(new Error('invalid-image')); else resolve(image); }; image.onerror = () => reject(new Error('decode')); image.src = url; }); }
  async function transparency(image, format) { if (format.name === 'JPEG') return 'No â€” JPEG does not support transparency.'; const pixelCount = image.naturalWidth * image.naturalHeight; const scale = pixelCount > MAX_ALPHA_PIXELS ? Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight)) : 1; const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.ceil(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.ceil(image.naturalHeight * scale)); try { const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return 'Unable to determine'; context.drawImage(image, 0, 0, canvas.width, canvas.height); const data = context.getImageData(0, 0, canvas.width, canvas.height).data; for (let index = 3; index < data.length; index += 4) if (data[index] < 255) { canvas.width = canvas.height = 1; return 'Yes â€” transparent pixels detected'; } const result = pixelCount > MAX_ALPHA_PIXELS ? 'Unable to determine for this large image' : 'No transparency detected'; canvas.width = canvas.height = 1; return result; } catch (error) { canvas.width = canvas.height = 1; return 'Unable to determine'; } }
  async function inspectFiles(files) {
    if (state.busy) return; clearError(); input.value = ''; if (files.length > 1) { showError('Please select one image at a time.'); return; } const problem = validate(files[0]); if (problem) { showError(problem); return; }
    resetTool(); state.busy = true; const token = ++state.token; state.file = files[0]; state.url = URL.createObjectURL(state.file); $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} Â· Reading imageâ€¦`; $('[data-file-summary]').hidden = false; zone.hidden = true; $('[data-processing]').hidden = false; $('[data-status]').textContent = 'Reading imageâ€¦';
    try { state.image = await loadImage(state.file, state.url, token); $('[data-status]').textContent = 'Checking image informationâ€¦'; const format = formatFor(state.file); const alpha = await transparency(state.image, format); if (token !== state.token) return; renderResult(format, alpha); $('[data-processing]').hidden = true; $('[data-result]').hidden = false; $('[data-status]').textContent = `Image dimensions are ${state.image.naturalWidth} by ${state.image.naturalHeight} pixels.`; }
    catch (error) { if (error.message !== 'stale') { revokeUrl(); resetTool(); showError('Unable to read this image. The file may be corrupted or unsupported.'); } }
    finally { state.busy = false; $('[data-processing]').hidden = true; }
  }
  function renderResult(format, alpha) { const image = state.image; $('[data-preview]').src = state.url; $('[data-preview]').alt = `Preview of ${state.file.name}, ${image.naturalWidth} by ${image.naturalHeight} pixels`; $('[data-dimensions]').textContent = `${image.naturalWidth} Ã— ${image.naturalHeight} px`; $('[data-result-name]').textContent = state.file.name; $('[data-format]').textContent = format.name; $('[data-mime]').textContent = state.file.type || format.mime; $('[data-size]').textContent = `${formatBytes(state.file.size)} (${state.file.size.toLocaleString()} bytes)`; $('[data-ratio]').textContent = aspectRatio(image.naturalWidth, image.naturalHeight); $('[data-transparency]').textContent = alpha; }
  function revokeUrl() { if (state.url) URL.revokeObjectURL(state.url); state.url = null; }
  function resetTool() { state.token += 1; revokeUrl(); state.file = null; state.image = null; input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-result]').hidden = true; $('[data-preview]').removeAttribute('src'); $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-dimensions]').textContent = '0 Ã— 0 px'; $('[data-status]').textContent = 'Choose an image to begin.'; clearError(); }
})();

