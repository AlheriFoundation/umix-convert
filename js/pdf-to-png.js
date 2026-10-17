(() => {
  'use strict';

  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_PAGES = 50;
  const SCALE = 1.8;
  const state = { file: null, pdf: null, results: [], busy: false };

  const $ = selector => document.querySelector(selector);
  const uploadZone = $('[data-upload-zone]');
  const fileInput = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const summary = $('[data-file-summary]');
  const processing = $('[data-processing-panel]');
  const actions = $('[data-converter-actions]');
  const resultsPanel = $('[data-results-panel]');
  const resultsGrid = $('[data-results-grid]');

  if (!uploadZone || !fileInput || !window.pdfjsLib) {
    showError('This tool could not load its PDF processing library. Please refresh the page and try again.');
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); fileInput.click(); });
  uploadZone.addEventListener('click', () => { if (!state.busy) fileInput.click(); });
  uploadZone.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', event => handleFile(event.target.files[0]));
  uploadZone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) uploadZone.classList.add('is-dragging'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragging'));
  uploadZone.addEventListener('drop', event => {
    event.preventDefault();
    uploadZone.classList.remove('is-dragging');
    if (!state.busy) handleFile(event.dataTransfer.files[0]);
  });
  $('[data-remove-file]').addEventListener('click', () => { if (!state.busy) resetTool(); });
  $('[data-reset]').addEventListener('click', () => { if (!state.busy) resetTool(); });
  $('[data-convert]').addEventListener('click', convertPdf);
  $('[data-download-all]').addEventListener('click', downloadAll);

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
  function baseName(name) { return name.replace(/\.pdf$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'converted-pdf'; }

  async function handleFile(file) {
    clearError();
    if (!file) { showError('Please select a PDF file.'); return; }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { showError('Please select a PDF file.'); fileInput.value = ''; return; }
    if (file.size > MAX_FILE_SIZE) { showError('This PDF is larger than 25 MB. Please choose a smaller file.'); fileInput.value = ''; return; }

    state.file = file;
    state.pdf = null;
    state.busy = true;
    summary.hidden = false;
    $('[data-file-name]').textContent = file.name;
    $('[data-file-meta]').textContent = `${formatBytes(file.size)} Â· Checking PDF...`;
    actions.hidden = true;
    resultsPanel.hidden = true;
    uploadZone.hidden = true;
    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const pdf = await loadingTask.promise;
      state.pdf = pdf;
      if (pdf.numPages > MAX_PAGES) {
        resetTool();
        showError(`This PDF has ${pdf.numPages} pages. Please choose a PDF with ${MAX_PAGES} pages or fewer.`);
        return;
      }
      $('[data-file-meta]').textContent = `${formatBytes(file.size)} Â· ${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}`;
      actions.hidden = false;
      state.busy = false;
    } catch (error) {
      resetTool();
      showError('This PDF could not be read. It may be corrupted, password-protected, or unsupported.');
    }
  }

  async function convertPdf() {
    if (!state.pdf || state.busy) return;
    clearError();
    state.busy = true;
    actions.hidden = true;
    processing.hidden = false;
    resultsPanel.hidden = true;
    resultsGrid.replaceChildren();
    revokeResults();
    state.results = [];
    const total = state.pdf.numPages;
    const progress = $('[data-progress-bar]');
    const label = $('[data-processing-label]');
    const count = $('[data-processing-count]');
    try {
      for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
        label.textContent = `Rendering page ${pageNumber} of ${total}...`;
        count.textContent = `${pageNumber - 1} of ${total} complete`;
        progress.style.width = `${((pageNumber - 1) / total) * 100}%`;
        const page = await state.pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('Canvas rendering is unavailable.');
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image creation failed')), 'image/png'));
        const url = URL.createObjectURL(blob);
        state.results.push({ blob, url, name: `${baseName(state.file.name)}-page-${pageNumber}.png`, pageNumber });
        canvas.width = 1;
        canvas.height = 1;
      }
      progress.style.width = '100%';
      label.textContent = `${total} ${total === 1 ? 'page' : 'pages'} converted successfully.`;
      count.textContent = '';
      renderResults();
      resultsPanel.hidden = false;
    } catch (error) {
      revokeResults();
      state.results = [];
      showError('The PDF could not be converted. Please try another PDF or a smaller file.');
      actions.hidden = false;
    } finally {
      state.busy = false;
      processing.hidden = true;
    }
  }

  function renderResults() {
    const fragment = document.createDocumentFragment();
    state.results.forEach(result => {
      const card = document.createElement('article');
      card.className = 'result-card';
      const heading = document.createElement('div');
      heading.className = 'result-card-heading';
      const title = document.createElement('h3');
      title.textContent = `Page ${result.pageNumber}`;
      const fileName = document.createElement('span');
      fileName.className = 'result-file-name';
      fileName.textContent = result.name;
      const download = document.createElement('a');
      download.className = 'text-link';
      download.href = result.url;
      download.download = result.name;
      download.textContent = 'Download PNG â†’';
      download.setAttribute('aria-label', `Download PNG for page ${result.pageNumber}`);
      heading.append(title, download);
      const image = document.createElement('img');
      image.src = result.url;
      image.alt = `PNG preview of page ${result.pageNumber}`;
      image.loading = 'lazy';
      card.append(heading, fileName, image);
      fragment.append(card);
    });
    resultsGrid.replaceChildren(fragment);
  }

  async function downloadAll() {
    if (!state.results.length || state.busy) return;
    const button = $('[data-download-all]');
    state.busy = true;
    button.disabled = true;
    button.textContent = 'Preparing ZIP...';
    try {
      if (!window.JSZip) throw new Error('ZIP library unavailable');
      const zip = new JSZip();
      state.results.forEach(result => zip.file(result.name, result.blob));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const zipUrl = URL.createObjectURL(blob);
      triggerDownload(zipUrl, `${baseName(state.file.name)}-png-pages.zip`);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
    } catch (error) {
      showError('All PNGs could not be packaged. Please download the pages individually.');
    } finally {
      state.busy = false;
      button.disabled = false;
      button.textContent = 'Download All PNGs';
    }
  }

  function triggerDownload(url, name) { const link = document.createElement('a'); link.href = url; link.download = name; link.click(); }
  function revokeResults() { state.results.forEach(result => URL.revokeObjectURL(result.url)); }

  function resetTool() {
    if (state.pdf && typeof state.pdf.destroy === 'function') Promise.resolve(state.pdf.destroy()).catch(() => {});
    state.busy = false;
    state.file = null;
    state.pdf = null;
    revokeResults();
    state.results = [];
    fileInput.value = '';
    summary.hidden = true;
    uploadZone.hidden = false;
    actions.hidden = true;
    processing.hidden = true;
    resultsPanel.hidden = true;
    resultsGrid.replaceChildren();
    $('[data-progress-bar]').style.width = '0%';
    clearError();
  }
})();

