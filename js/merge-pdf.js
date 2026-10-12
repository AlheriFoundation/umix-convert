(() => {
  'use strict';
  const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
  const MAX_FILES = 50;
  const state = { items: [], resultUrl: null, busy: false, token: 0 };
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  if (!zone || !input || !window.pdfjsLib || !window.PDFLib) { if (errorBox) showError('This tool could not load its PDF processing libraries. Please refresh the page and try again.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  $('[data-add-more]').addEventListener('click', () => { if (!state.busy) input.click(); });
  input.addEventListener('change', event => addFiles([...event.target.files]));
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) addFiles([...event.dataTransfer.files]); });
  $('[data-merge-list]').addEventListener('click', handleListAction);
  $('[data-merge]').addEventListener('click', mergePdfs);
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => { if (!state.busy) resetTool(); }));

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function totalSize() { return state.items.reduce((sum, item) => sum + item.file.size, 0); }
  function totalPages() { return state.items.reduce((sum, item) => sum + item.pageCount, 0); }
  function validateFiles(files) {
    if (!files.length) return 'Please select at least one PDF file.';
    if (state.items.length + files.length > MAX_FILES) return `Maximum ${MAX_FILES} PDF files.`;
    for (const file of files) { if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name)) return 'Please select valid PDF files only.'; if (!file.size) return 'One or more selected files are empty or invalid.'; }
    if (totalSize() + files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) return 'The total file size exceeds the 25 MB limit.';
    return '';
  }
  async function addFiles(files) {
    if (state.busy) return; clearError(); input.value = ''; const problem = validateFiles(files); if (problem) { showError(problem); return; }
    state.busy = true; const token = ++state.token; const loaded = [];
    try {
      for (const file of files) { const item = await inspectPdf(file); loaded.push(item); if (token !== state.token) { cleanupItems(loaded); return; } }
      state.items.push(...loaded); invalidateResult(); renderList();
    } catch (error) { cleanupItems(loaded); showError(error.message === 'password' ? 'This PDF appears to be password-protected or cannot be processed.' : 'One of the selected files could not be read as a PDF.'); }
    finally { state.busy = false; }
  }
  async function inspectPdf(file) {
    const buffer = await file.arrayBuffer();
    let loadingTask;
    try {
      loadingTask = pdfjsLib.getDocument({ data: buffer, password: '' });
      const pdf = await loadingTask.promise;
      if (!pdf.numPages) throw new Error('invalid');
      const item = { file, pdf, pageCount: pdf.numPages, previewUrl: null };
      try { item.previewUrl = await renderPreview(pdf); } catch (previewError) { item.previewUrl = null; }
      return item;
    } catch (error) { if (loadingTask && loadingTask.destroy) await loadingTask.destroy().catch(() => {}); if (error && /password|encrypted/i.test(error.message || '')) throw new Error('password'); throw error; }
  }
  async function renderPreview(pdf) {
    const page = await pdf.getPage(1); const viewport = page.getViewport({ scale: 0.42 }); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const context = canvas.getContext('2d', { alpha: false }); if (!context) throw new Error('preview'); await page.render({ canvasContext: context, viewport }).promise; if (page.cleanup) page.cleanup(); const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('preview')), 'image/jpeg', 0.82)); canvas.width = canvas.height = 1; return URL.createObjectURL(blob);
  }
  function renderList() {
    const panel = $('[data-list-panel]'); panel.hidden = !state.items.length; zone.hidden = state.items.length > 0; $('[data-converter-actions]').hidden = state.items.length < 2; $('[data-file-count]').textContent = state.items.length; $('[data-total-summary]').textContent = `${state.items.length} PDF ${state.items.length === 1 ? 'file' : 'files'} Â· ${totalPages()} total ${totalPages() === 1 ? 'page' : 'pages'} Â· ${formatBytes(totalSize())} total`;
    const fragment = document.createDocumentFragment(); state.items.forEach((item, index) => { const row = document.createElement('article'); row.className = 'merge-file-row'; const preview = document.createElement('div'); preview.className = 'merge-preview'; if (item.previewUrl) { const image = document.createElement('img'); image.src = item.previewUrl; image.alt = `First-page preview of ${item.file.name}`; preview.append(image); } else { preview.textContent = 'PDF'; preview.setAttribute('aria-label', 'PDF preview unavailable'); } const details = document.createElement('div'); details.className = 'merge-file-details'; const name = document.createElement('strong'); name.textContent = item.file.name; const meta = document.createElement('span'); meta.textContent = `${item.pageCount} ${item.pageCount === 1 ? 'page' : 'pages'} Â· ${formatBytes(item.file.size)}`; details.append(name, meta); const controls = document.createElement('div'); controls.className = 'merge-file-controls'; const position = document.createElement('span'); position.className = 'image-position'; position.textContent = index + 1; position.setAttribute('aria-label', `Position ${index + 1}`); const up = actionButton('Move Up', 'up', index, index === 0); const down = actionButton('Move Down', 'down', index, index === state.items.length - 1); const remove = actionButton('Remove', 'remove', index, false); controls.append(position, up, down, remove); row.append(preview, details, controls); fragment.append(row); }); $('[data-merge-list]').replaceChildren(fragment);
  }
  function actionButton(label, action, index, disabled) { const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-secondary button-small'; button.textContent = label; button.dataset.action = action; button.dataset.index = index; button.disabled = disabled; button.setAttribute('aria-label', `${label} ${state.items[index].file.name}`); return button; }
  function handleListAction(event) { const button = event.target.closest('button[data-action]'); if (!button || state.busy) return; const index = Number(button.dataset.index); const action = button.dataset.action; if (action === 'remove') { destroyItem(state.items.splice(index, 1)[0]); } else if (action === 'up' && index > 0) { [state.items[index - 1], state.items[index]] = [state.items[index], state.items[index - 1]]; } else if (action === 'down' && index < state.items.length - 1) { [state.items[index + 1], state.items[index]] = [state.items[index], state.items[index + 1]]; } invalidateResult(); renderList(); }
  async function mergePdfs() {
    if (state.items.length < 2) { showError('Select at least 2 PDF files to merge.'); return; }
    if (state.busy) return; clearError(); state.busy = true; const token = ++state.token; $('[data-converter-actions]').hidden = true; $('[data-result-panel]').hidden = true; $('[data-processing-panel]').hidden = false; const progress = $('[data-progress-bar]'); const track = progress.parentElement; const label = $('[data-processing-label]'); const count = $('[data-processing-count]');
    try {
      const merged = await PDFLib.PDFDocument.create();
      for (let index = 0; index < state.items.length; index += 1) { if (token !== state.token) return; const item = state.items[index]; label.textContent = `Merging PDF ${index + 1} of ${state.items.length}â€¦`; count.textContent = `${index} of ${state.items.length} complete`; const percent = Math.round(index / state.items.length * 90); progress.style.width = `${percent}%`; track.setAttribute('aria-valuenow', percent); const source = await PDFLib.PDFDocument.load(await item.file.arrayBuffer()); const pages = await merged.copyPages(source, source.getPageIndices()); pages.forEach(page => merged.addPage(page)); await yieldBrowser(); }
      if (token !== state.token) return; label.textContent = 'Finalizing merged PDFâ€¦'; progress.style.width = '95%'; track.setAttribute('aria-valuenow', '95'); const bytes = await merged.save(); const blob = new Blob([bytes], { type: 'application/pdf' }); revokeResult(); state.resultUrl = URL.createObjectURL(blob); const download = $('[data-download]'); download.href = state.resultUrl; download.download = 'merged.pdf'; $('[data-result-meta]').textContent = `${state.items.length} PDFs Â· ${totalPages()} pages Â· ${formatBytes(blob.size)}`; progress.style.width = '100%'; track.setAttribute('aria-valuenow', '100'); $('[data-processing-panel]').hidden = true; $('[data-result-panel]').hidden = false;
    } catch (error) { showError(/password|encrypted/i.test(error.message || '') ? 'This PDF appears to be password-protected or cannot be processed.' : 'The PDFs could not be merged. Please try valid, unencrypted PDF files.'); }
    finally { state.busy = false; $('[data-processing-panel]').hidden = true; if ($('[data-result-panel]').hidden) $('[data-converter-actions]').hidden = false; }
  }
  function yieldBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }
  function destroyItem(item) { if (!item) return; if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); if (item.pdf && item.pdf.destroy) Promise.resolve(item.pdf.destroy()).catch(() => {}); }
  function cleanupItems(items) { items.forEach(destroyItem); }
  function revokeResult() { if (state.resultUrl) URL.revokeObjectURL(state.resultUrl); state.resultUrl = null; $('[data-download]').removeAttribute('href'); }
  function invalidateResult() { revokeResult(); $('[data-result-panel]').hidden = true; }
  function resetTool() { state.token += 1; cleanupItems(state.items); revokeResult(); state.items = []; input.value = ''; $('[data-list-panel]').hidden = true; zone.hidden = false; $('[data-converter-actions]').hidden = true; $('[data-processing-panel]').hidden = true; $('[data-merge-list]').replaceChildren(); $('[data-file-count]').textContent = '0'; $('[data-total-summary]').textContent = '0 PDF files Â· 0 total pages Â· 0 B total'; $('[data-progress-bar]').style.width = '0%'; $('[data-progress-bar]').parentElement.setAttribute('aria-valuenow', '0'); clearError(); }
})();

