(() => {
  'use strict';

  const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
  const MAX_FILES = 50;
  const PX_TO_PT = 72 / 96;
  const margins = { none: 0, small: 18, medium: 36, large: 54 };
  const formats = new Map([['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]);
  const $ = selector => document.querySelector(selector);
  const uploadZone = $('[data-upload-zone]');
  const fileInput = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const listPanel = $('[data-image-list-panel]');
  const imageList = $('[data-image-list]');
  const settings = $('[data-settings]');
  const processing = $('[data-processing-panel]');
  const actions = $('[data-converter-actions]');
  const resultPanel = $('[data-pdf-result]');
  const state = { items: [], pdfUrl: null, busy: false, operation: 0 };

  if (!uploadZone || !fileInput || !errorBox || !window.jspdf || !window.jspdf.jsPDF) { if (errorBox) showError('This tool could not load its PDF creation library. Please refresh the page and try again.'); return; }

  function extension(name) { const match = name.toLowerCase().match(/\.([a-z0-9]+)$/); return match ? match[1] : ''; }
  function formatBytes(bytes) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
  function safeStem(name) { return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'umix-images'; }
  function totalBytes(items = state.items) { return items.reduce((total, item) => total + item.file.size, 0); }
  function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
  function clearError() { showError(''); }
  function revokePdf() { if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl); state.pdfUrl = null; }
  function invalidatePdf() { revokePdf(); resultPanel.hidden = true; actions.hidden = !state.items.length; }
  function setSettingsEnabled(enabled) { settings.querySelectorAll('select').forEach(control => { control.disabled = !enabled || state.busy; }); }

  function validateFiles(files) {
    if (!files.length) return 'Please select at least one JPG, PNG or WebP image.';
    if (state.items.length + files.length > MAX_FILES) return `You can select up to ${MAX_FILES} images.`;
    for (const file of files) { const expectedType = formats.get(extension(file.name)); if (!expectedType || file.type !== expectedType) return 'Unsupported file. Please choose JPG, JPEG, PNG or WebP images with matching file types and extensions.'; if (!file.size) return 'One or more selected files are empty or invalid.'; }
    if (totalBytes() + files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) return 'The selected images exceed the 25 MB total size limit.';
    return '';
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => { const previewUrl = URL.createObjectURL(file); const image = new Image(); image.decoding = 'async'; image.onload = () => resolve({ file, previewUrl, image, width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => { URL.revokeObjectURL(previewUrl); reject(new Error('decode')); }; image.src = previewUrl; });
  }

  async function addFiles(files) {
    if (state.busy) return; clearError(); fileInput.value = ''; const problem = validateFiles(files); if (problem) { showError(problem); return; }
    state.busy = true; setSettingsEnabled(false); const token = ++state.operation; const loaded = [];
    try { for (const file of files) loaded.push(await loadImage(file)); if (token !== state.operation) { loaded.forEach(item => URL.revokeObjectURL(item.previewUrl)); return; } state.items.push(...loaded); invalidatePdf(); renderList(); }
    catch (error) { loaded.forEach(item => URL.revokeObjectURL(item.previewUrl)); showError('One or more images could not be decoded. Please choose valid, non-corrupted images.'); }
    finally { if (token === state.operation) { state.busy = false; setSettingsEnabled(true); } }
  }

  function renderList() {
    listPanel.hidden = !state.items.length; uploadZone.hidden = state.items.length > 0; settings.hidden = !state.items.length; actions.hidden = !state.items.length || Boolean(state.pdfUrl); $('[data-file-count]').textContent = state.items.length; const fragment = document.createDocumentFragment();
    state.items.forEach((item, index) => { const row = document.createElement('article'); row.className = 'image-file-row'; const image = document.createElement('img'); image.src = item.previewUrl; image.alt = `Preview of ${item.file.name}`; image.width = 88; image.height = 66; const details = document.createElement('div'); details.className = 'image-file-details'; const name = document.createElement('strong'); name.textContent = item.file.name; const meta = document.createElement('span'); meta.textContent = `${formatBytes(item.file.size)} Â· ${item.width} Ã— ${item.height}px`; details.append(name, meta); const controls = document.createElement('div'); controls.className = 'image-file-controls'; const position = document.createElement('span'); position.className = 'image-position'; position.textContent = `${index + 1}`; position.setAttribute('aria-label', `Image ${index + 1} of ${state.items.length}`); controls.append(position, control('Move Up', () => moveItem(index, -1), index === 0 || state.busy), control('Move Down', () => moveItem(index, 1), index === state.items.length - 1 || state.busy), control('Remove', () => removeItem(index), state.busy)); row.append(image, details, controls); fragment.append(row); }); imageList.replaceChildren(fragment);
  }
  function control(label, handler, disabled) { const button = document.createElement('button'); button.className = 'button button-secondary button-small'; button.type = 'button'; button.textContent = label; button.disabled = disabled; button.addEventListener('click', handler); return button; }
  function moveItem(index, direction) { if (state.busy) return; const target = index + direction; if (target < 0 || target >= state.items.length) return; [state.items[index], state.items[target]] = [state.items[target], state.items[index]]; invalidatePdf(); renderList(); }
  function removeItem(index) { if (state.busy) return; const [removed] = state.items.splice(index, 1); if (removed) URL.revokeObjectURL(removed.previewUrl); invalidatePdf(); renderList(); }

  function pageDimensions(item) {
    const size = $('[data-page-size]').value; const orientation = $('[data-orientation]').value; let width; let height;
    if (size === 'a4') { width = 595.2756; height = 841.8898; } else if (size === 'letter') { width = 612; height = 792; } else { width = item.width * PX_TO_PT; height = item.height * PX_TO_PT; }
    const shouldLandscape = orientation === 'landscape' || (orientation === 'auto' && item.width > item.height); if (shouldLandscape && height > width) [width, height] = [height, width]; if (orientation === 'portrait' && width > height) [width, height] = [height, width]; return { width, height };
  }
  function placement(item, page) {
    const configuredMargin = margins[$('[data-margin]').value]; const margin = Math.max(0, Math.min(configuredMargin, page.width / 2 - 1, page.height / 2 - 1)); const areaWidth = page.width - margin * 2; const areaHeight = page.height - margin * 2; const imageWidth = item.width * PX_TO_PT; const imageHeight = item.height * PX_TO_PT; const fitting = $('[data-fitting]').value; let scale = fitting === 'fill' ? Math.max(areaWidth / imageWidth, areaHeight / imageHeight) : Math.min(areaWidth / imageWidth, areaHeight / imageHeight); scale = Math.min(scale, 1); const width = imageWidth * scale; const height = imageHeight * scale; return { x: (page.width - width) / 2, y: (page.height - height) / 2, width, height }; }
  function imageData(item) { const canvas = document.createElement('canvas'); canvas.width = item.width; canvas.height = item.height; const context = canvas.getContext('2d'); if (!context) throw new Error('canvas'); context.drawImage(item.image, 0, 0); const isJpeg = item.file.type === 'image/jpeg'; if (isJpeg) return { data: canvas.toDataURL('image/jpeg', .95), format: 'JPEG' }; return { data: canvas.toDataURL('image/png'), format: 'PNG' }; }
  function waitForBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }

  async function generatePdf() {
    if (!state.items.length || state.busy) return; clearError(); state.busy = true; const token = ++state.operation; actions.hidden = true; resultPanel.hidden = true; processing.hidden = false; setSettingsEnabled(false); const progress = $('[data-progress-bar]'); const label = $('[data-processing-label]'); const count = $('[data-processing-count]'); const track = progress.parentElement; const items = [...state.items];
    try { let pdf = null; for (let index = 0; index < items.length; index += 1) { if (token !== state.operation) return; const item = items[index]; label.textContent = `Processing image ${index + 1} of ${items.length}...`; count.textContent = `${index} of ${items.length} complete`; const percent = Math.round(index / items.length * 100); progress.style.width = `${percent}%`; track.setAttribute('aria-valuenow', percent); const page = pageDimensions(item); const position = placement(item, page); const encoded = imageData(item); if (!pdf) pdf = new window.jspdf.jsPDF({ unit: 'pt', format: [page.width, page.height], compress: true }); else pdf.addPage([page.width, page.height]); pdf.addImage(encoded.data, encoded.format, position.x, position.y, position.width, position.height, undefined, 'MEDIUM'); await waitForBrowser(); }
      if (token !== state.operation) return; label.textContent = 'Generating PDF...'; progress.style.width = '100%'; track.setAttribute('aria-valuenow', '100'); const blob = pdf.output('blob'); revokePdf(); state.pdfUrl = URL.createObjectURL(blob); $('[data-result-meta]').textContent = `${items.length} ${items.length === 1 ? 'image' : 'images'} Â· ${formatBytes(blob.size)}`; resultPanel.hidden = false;
    } catch (error) { if (token === state.operation) { showError('The PDF could not be generated. Please try fewer or smaller images.'); actions.hidden = false; } }
    finally { if (token === state.operation) { state.busy = false; processing.hidden = true; setSettingsEnabled(true); renderList(); } }
  }

  function downloadPdf() { if (!state.pdfUrl || state.busy) return; const link = document.createElement('a'); link.href = state.pdfUrl; link.download = state.items.length === 1 ? `${safeStem(state.items[0].file.name)}.pdf` : 'umix-images.pdf'; link.click(); }
  function resetTool() { state.operation += 1; state.busy = false; state.items.forEach(item => URL.revokeObjectURL(item.previewUrl)); state.items = []; revokePdf(); fileInput.value = ''; uploadZone.hidden = false; listPanel.hidden = true; settings.hidden = true; actions.hidden = true; processing.hidden = true; resultPanel.hidden = true; imageList.replaceChildren(); $('[data-file-count]').textContent = '0'; const progress = $('[data-progress-bar]'); progress.style.width = '0%'; progress.parentElement.setAttribute('aria-valuenow', '0'); $('[data-page-size]').value = 'a4'; $('[data-orientation]').value = 'auto'; $('[data-margin]').value = 'small'; $('[data-fitting]').value = 'contain'; clearError(); setSettingsEnabled(false); }

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) fileInput.click(); }); $('[data-add-more]').addEventListener('click', () => { if (!state.busy) fileInput.click(); }); uploadZone.addEventListener('click', () => { if (!state.busy) fileInput.click(); }); uploadZone.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); fileInput.click(); } }); fileInput.addEventListener('change', event => addFiles([...event.target.files])); uploadZone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) uploadZone.classList.add('is-dragging'); }); uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragging')); uploadZone.addEventListener('drop', event => { event.preventDefault(); uploadZone.classList.remove('is-dragging'); if (!state.busy) addFiles([...event.dataTransfer.files]); }); $('[data-generate]').addEventListener('click', generatePdf); $('[data-download-pdf]').addEventListener('click', downloadPdf); document.querySelectorAll('[data-reset], [data-reset-result]').forEach(button => button.addEventListener('click', resetTool)); document.querySelectorAll('[data-page-size], [data-orientation], [data-margin], [data-fitting]').forEach(control => control.addEventListener('change', invalidatePdf)); window.addEventListener('beforeunload', () => { state.items.forEach(item => URL.revokeObjectURL(item.previewUrl)); revokePdf(); });
  setSettingsEnabled(false);
})();

