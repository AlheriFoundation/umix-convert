(() => {
  'use strict';

  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MIN_CROP_SIZE = 24;
  const formats = new Map([['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]);
  const $ = selector => document.querySelector(selector);
  const uploadZone = $('[data-upload-zone]');
  const fileInput = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const editor = $('[data-editor]');
  const stage = $('[data-stage]');
  const imageElement = $('[data-editor-image]');
  const cropBox = $('[data-crop-box]');
  const state = { file: null, url: null, image: null, crop: null, version: 0, resultUrl: null, busy: false, interaction: null, loadingUrl: null };

  if (!uploadZone || !fileInput || !errorBox || !editor || !stage || !imageElement || !cropBox) return;

  function extension(name) { const match = name.toLowerCase().match(/\.([a-z0-9]+)$/); return match ? match[1] : ''; }
  function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
  function clearError() { showError(''); }
  function setStatus(message) { $('[data-status]').textContent = message; }
  function safeStem(name) { return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'image'; }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function currentRatio() { const value = $('[data-aspect]').value; return value === 'free' ? null : Number(value); }
  function formatRatio(ratio) { if (!ratio) return 'Free'; if (Math.abs(ratio - 1) < .001) return '1:1'; if (Math.abs(ratio - 4 / 3) < .001) return '4:3'; return '16:9'; }
  function revokeResult() { if (state.resultUrl) URL.revokeObjectURL(state.resultUrl); state.resultUrl = null; }
  function revokeSource() { if (state.url) URL.revokeObjectURL(state.url); if (state.loadingUrl && state.loadingUrl !== state.url) URL.revokeObjectURL(state.loadingUrl); state.url = null; state.loadingUrl = null; }
  function resetResult() { revokeResult(); $('[data-result]').hidden = true; $('[data-download]').removeAttribute('href'); }
  function setControlsEnabled(enabled) { $('[data-export]').disabled = !enabled || state.busy; $('[data-reset-crop]').disabled = !enabled || state.busy; document.querySelectorAll('[data-aspect], [data-format], [data-quality]').forEach(control => { control.disabled = !enabled || state.busy; }); }

  function validateFile(file) {
    if (!file) return 'Please choose one JPG, PNG or WebP image.';
    const format = formats.get(extension(file.name));
    if (!format || file.type !== format) return 'Unsupported file. Please choose a JPG, JPEG, PNG or WebP image with a matching extension.';
    if (!file.size) return 'This image is empty or invalid.';
    if (file.size > MAX_FILE_SIZE) return 'This image is larger than the 25 MB limit.';
    return '';
  }

  function loadImage(file) {
    const version = ++state.version;
    clearError(); state.busy = true; setStatus('Loading imageâ€¦'); setControlsEnabled(false); resetResult(); revokeSource();
    const url = URL.createObjectURL(file); state.loadingUrl = url;
    const image = new Image(); image.decoding = 'async';
    image.onload = () => {
      if (version !== state.version) { URL.revokeObjectURL(url); return; }
      state.file = file; state.url = url; state.loadingUrl = null; state.image = image; state.crop = defaultCrop(image.naturalWidth, image.naturalHeight); state.busy = false; uploadZone.hidden = true; editor.hidden = false; imageElement.src = url; imageElement.alt = `Preview of ${file.name}`; setStatus('Image ready'); setControlsEnabled(true); render();
    };
    image.onerror = () => { if (version !== state.version) { URL.revokeObjectURL(url); return; } URL.revokeObjectURL(url); state.loadingUrl = null; state.busy = false; showError('We could not decode this image. Please choose a valid, non-corrupted image.'); setStatus('Image could not be loaded'); setControlsEnabled(false); };
    image.src = url;
  }

  function defaultCrop(width, height) { const ratio = currentRatio(); let cropWidth = width * .82; let cropHeight = height * .82; if (ratio) { cropHeight = cropWidth / ratio; if (cropHeight > height * .9) { cropHeight = height * .9; cropWidth = cropHeight * ratio; } } return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, w: cropWidth, h: cropHeight }; }
  function fitAspectCrop(crop, ratio, width, height) { if (!ratio) return crop; let w = crop.w; let h = w / ratio; if (h > crop.h) { h = crop.h; w = h * ratio; } if (w > width) { w = width; h = w / ratio; } if (h > height) { h = height; w = h * ratio; } return { x: clamp(crop.x + (crop.w - w) / 2, 0, width - w), y: clamp(crop.y + (crop.h - h) / 2, 0, height - h), w, h }; }
  function render() {
    if (!state.image || !state.crop) return;
    const displayedWidth = imageElement.clientWidth || imageElement.getBoundingClientRect().width;
    const displayedHeight = imageElement.clientHeight || imageElement.getBoundingClientRect().height;
    if (!displayedWidth || !displayedHeight) { requestAnimationFrame(render); return; }
    cropBox.style.left = `${state.crop.x / state.image.naturalWidth * displayedWidth}px`; cropBox.style.top = `${state.crop.y / state.image.naturalHeight * displayedHeight}px`; cropBox.style.width = `${state.crop.w / state.image.naturalWidth * displayedWidth}px`; cropBox.style.height = `${state.crop.h / state.image.naturalHeight * displayedHeight}px`;
    $('[data-crop-size]').textContent = `${Math.round(state.crop.w)} Ã— ${Math.round(state.crop.h)} px`; $('[data-crop-ratio]').textContent = formatRatio(currentRatio()); $('[data-output-summary]').textContent = $('[data-format]').value === 'image/png' ? 'PNG' : `JPG (${ $('[data-quality]').value }%)`;
  }

  function beginInteraction(event) {
    if (state.busy || !state.crop || event.button !== undefined && event.button !== 0) return;
    const handle = event.target.closest('[data-handle]'); const box = event.target.closest('[data-crop-box]'); if (!handle && !box) return;
    event.preventDefault(); state.interaction = { mode: handle ? handle.dataset.handle : 'move', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, crop: { ...state.crop } }; stage.setPointerCapture(event.pointerId);
  }

  function resizeCrop(start, mode, dx, dy, ratio, width, height) {
    const minWidth = ratio ? MIN_CROP_SIZE * ratio : MIN_CROP_SIZE; const minHeight = ratio ? MIN_CROP_SIZE : MIN_CROP_SIZE;
    if (!ratio) { let left = start.x; let top = start.y; let right = start.x + start.w; let bottom = start.y + start.h; if (mode.includes('l')) left = clamp(start.x + dx, 0, right - minWidth); if (mode.includes('r')) right = clamp(start.x + start.w + dx, left + minWidth, width); if (mode.includes('t')) top = clamp(start.y + dy, 0, bottom - minHeight); if (mode.includes('b')) bottom = clamp(start.y + start.h + dy, top + minHeight, height); return { x: left, y: top, w: right - left, h: bottom - top }; }
    const anchorX = mode.includes('l') ? start.x + start.w : start.x; const anchorY = mode.includes('t') ? start.y + start.h : start.y; const directionX = mode.includes('l') ? -1 : 1; const directionY = mode.includes('t') ? -1 : 1; const pointerWidth = Math.abs((mode.includes('l') ? start.x + dx : start.x + start.w + dx) - anchorX); const pointerHeight = Math.abs((mode.includes('t') ? start.y + dy : start.y + start.h + dy) - anchorY); let size = Math.max(pointerWidth, pointerHeight * ratio); const maxWidth = directionX < 0 ? anchorX : width - anchorX; const maxHeight = directionY < 0 ? anchorY : height - anchorY; size = clamp(size, Math.min(minWidth, maxWidth, maxHeight * ratio), Math.min(maxWidth, maxHeight * ratio)); const w = size; const h = size / ratio; return { x: directionX < 0 ? anchorX - w : anchorX, y: directionY < 0 ? anchorY - h : anchorY, w, h }; }

  function moveInteraction(event) {
    if (!state.interaction || event.pointerId !== state.interaction.pointerId || !state.image) return; event.preventDefault(); const rect = imageElement.getBoundingClientRect(); const dx = (event.clientX - state.interaction.startX) * state.image.naturalWidth / rect.width; const dy = (event.clientY - state.interaction.startY) * state.image.naturalHeight / rect.height; const start = state.interaction.crop;
    if (state.interaction.mode === 'move') state.crop = { x: clamp(start.x + dx, 0, state.image.naturalWidth - start.w), y: clamp(start.y + dy, 0, state.image.naturalHeight - start.h), w: start.w, h: start.h }; else state.crop = resizeCrop(start, state.interaction.mode, dx, dy, currentRatio(), state.image.naturalWidth, state.image.naturalHeight); resetResult(); render();
  }
  function endInteraction(event) { if (state.interaction && event.pointerId === state.interaction.pointerId) { state.interaction = null; if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId); } }

  async function exportCrop() {
    if (!state.image || !state.crop || state.busy) return; const version = state.version; const crop = { ...state.crop }; const mime = $('[data-format]').value; const quality = Number($('[data-quality]').value) / 100; state.busy = true; setControlsEnabled(false); $('[data-processing]').hidden = false; setStatus('Preparing cropâ€¦'); resetResult();
    try {
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(crop.w)); canvas.height = Math.max(1, Math.round(crop.h)); const context = canvas.getContext('2d'); if (!context) throw new Error('canvas'); if (mime === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); } context.drawImage(state.image, Math.round(crop.x), Math.round(crop.y), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, mime === 'image/jpeg' ? quality : undefined)); if (version !== state.version) return; if (!blob) throw new Error('export'); state.resultUrl = URL.createObjectURL(blob); const extensionName = mime === 'image/png' ? 'png' : 'jpg'; const name = `${safeStem(state.file.name)}-cropped.${extensionName}`; const download = $('[data-download]'); download.href = state.resultUrl; download.download = name; download.textContent = `Download ${name}`; $('[data-result-detail]').textContent = `${Math.round(crop.w)} Ã— ${Math.round(crop.h)} px Â· ${extensionName.toUpperCase()} Â· ${Math.round(blob.size / 1024)} KB`; $('[data-result]').hidden = false; setStatus('Crop complete');
    } catch (error) { if (version === state.version) { showError('We could not export this crop. Please try again or use another browser.'); setStatus('Export failed'); } } finally { if (version === state.version) { state.busy = false; $('[data-processing]').hidden = true; setControlsEnabled(true); } }
  }

  function resetCrop() { if (!state.image || state.busy) return; state.crop = defaultCrop(state.image.naturalWidth, state.image.naturalHeight); resetResult(); setStatus('Crop reset'); render(); }
  function startOver() { state.version += 1; state.busy = false; state.interaction = null; resetResult(); revokeSource(); state.file = null; state.image = null; state.crop = null; imageElement.removeAttribute('src'); editor.hidden = true; uploadZone.hidden = false; fileInput.value = ''; $('[data-processing]').hidden = true; clearError(); setStatus(''); setControlsEnabled(false); }
  function chooseFiles(files) { if (state.busy) return; if (files.length !== 1) { showError('Please choose exactly one image. Multiple images are not supported.'); return; } const problem = validateFile(files[0]); if (problem) { showError(problem); return; } loadImage(files[0]); }

  $('[data-browse]').addEventListener('click', () => { if (!state.busy) fileInput.click(); }); fileInput.addEventListener('change', event => { chooseFiles([...event.target.files]); fileInput.value = ''; });
  uploadZone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) uploadZone.classList.add('is-dragging'); }); uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragging')); uploadZone.addEventListener('drop', event => { event.preventDefault(); uploadZone.classList.remove('is-dragging'); chooseFiles([...event.dataTransfer.files]); });
  stage.addEventListener('pointerdown', beginInteraction); stage.addEventListener('pointermove', moveInteraction); stage.addEventListener('pointerup', endInteraction); stage.addEventListener('pointercancel', endInteraction);
  $('[data-aspect]').addEventListener('change', () => { if (state.crop && state.image) { state.crop = fitAspectCrop(state.crop, currentRatio(), state.image.naturalWidth, state.image.naturalHeight); resetResult(); render(); } }); $('[data-format]').addEventListener('change', () => { $('[data-quality-control]').hidden = $('[data-format]').value !== 'image/jpeg'; resetResult(); render(); }); $('[data-quality]').addEventListener('input', () => { $('[data-quality-value]').textContent = `${$('[data-quality]').value}%`; resetResult(); render(); });
  $('[data-export]').addEventListener('click', exportCrop); $('[data-reset-crop]').addEventListener('click', resetCrop); $('[data-start-over]').addEventListener('click', startOver); window.addEventListener('resize', render); window.addEventListener('beforeunload', () => { revokeSource(); revokeResult(); });
  setControlsEnabled(false);
})();

