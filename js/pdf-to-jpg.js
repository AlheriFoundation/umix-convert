(() => {
  'use strict';

  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_PAGES = 50;
  const JPEG_QUALITY = 0.9;
  const SCALE = 1.8;
  const state = { file: null, pdf: null, results: [], busy: false };
  const diagnosticsEnabled = new URLSearchParams(window.location.search).get('pdfdiag') === '1';
  let diagnosticPanel;

  function diagnosticError(error) {
    return { name: error?.name || 'Error', message: String(error?.message || 'Unknown error').replace(/[\r\n]+/g, ' ').slice(0, 180) };
  }

  function diagnosticLog(event, details = {}) {
    if (!diagnosticsEnabled) return;
    if (!diagnosticPanel) {
      diagnosticPanel = document.createElement('pre');
      diagnosticPanel.setAttribute('aria-label', 'PDF conversion diagnostics');
      diagnosticPanel.style.cssText = 'position:fixed;z-index:9999;left:8px;right:8px;bottom:8px;max-height:35vh;overflow:auto;margin:0;padding:8px;background:#10243a;color:#fff;font:12px/1.4 monospace;white-space:pre-wrap;border-radius:6px;opacity:.94;';
      document.body.append(diagnosticPanel);
    }
    const line = JSON.stringify({ event, ...details });
    diagnosticPanel.textContent += `${diagnosticPanel.textContent ? '\n' : ''}${line}`;
    console.info('[pdfdiag]', event, details);
  }

  function sampleCanvas(context, width, height) {
    const step = 16;
    try {
      const pixels = context.getImageData(0, 0, width, height).data;
      let sampled = 0;
      let nonEmpty = 0;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const index = (y * width + x) * 4;
          sampled += 1;
          if (pixels[index + 3] > 0 && (pixels[index] < 250 || pixels[index + 1] < 250 || pixels[index + 2] < 250)) nonEmpty += 1;
        }
      }
      return { sampledPixels: sampled, nonEmptyPixels: nonEmpty, imageDataError: null };
    } catch (error) {
      return { sampledPixels: 0, nonEmptyPixels: 0, imageDataError: diagnosticError(error) };
    }
  }

  function inspectExport(blob) {
    return new Promise(resolve => {
      if (typeof Image !== 'function') { resolve({ decoded: false, exportEmpty: null, decodeError: { name: 'Unsupported', message: 'Image API unavailable' } }); return; }
      const image = new Image();
      const url = URL.createObjectURL(blob);
      const finish = details => { URL.revokeObjectURL(url); resolve(details); };
      image.onload = () => {
        try {
          const probe = document.createElement('canvas');
          probe.width = 32;
          probe.height = 32;
          const context = probe.getContext('2d', { alpha: true });
          if (!context) throw new Error('Export probe canvas unavailable.');
          context.drawImage(image, 0, 0, probe.width, probe.height);
          const sample = sampleCanvas(context, probe.width, probe.height);
          finish({ decoded: true, width: image.naturalWidth, height: image.naturalHeight, exportEmpty: sample.nonEmptyPixels === 0, exportSample: sample });
        } catch (error) {
          finish({ decoded: false, exportEmpty: null, decodeError: diagnosticError(error) });
        }
      };
      image.onerror = () => finish({ decoded: false, exportEmpty: null, decodeError: { name: 'ImageDecodeError', message: 'Export image could not be decoded' } });
      image.src = url;
    });
  }

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

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }

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
    $('[data-file-meta]').textContent = `${formatBytes(file.size)} · Checking PDF...`;
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
      $('[data-file-meta]').textContent = `${formatBytes(file.size)} · ${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}`;
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
        if (!context) {
          diagnosticLog('canvas-context-error', { page: pageNumber, width: canvas.width, height: canvas.height, error: { name: 'CanvasContextError', message: '2D canvas context unavailable' } });
          throw new Error('Canvas rendering is unavailable.');
        }
        const contextAttributes = typeof context.getContextAttributes === 'function' ? context.getContextAttributes() : null;
        diagnosticLog('canvas-created', { page: pageNumber, width: canvas.width, height: canvas.height, toBlob: typeof canvas.toBlob === 'function', alpha: contextAttributes ? contextAttributes.alpha : null });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        try {
          await page.render({ canvasContext: context, viewport }).promise;
          diagnosticLog('render-complete', { page: pageNumber, ...sampleCanvas(context, canvas.width, canvas.height) });
        } catch (error) {
          diagnosticLog('render-error', { page: pageNumber, error: diagnosticError(error) });
          throw error;
        }
        let blob;
        try {
          blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image creation failed')), 'image/jpeg', JPEG_QUALITY));
          diagnosticLog('export-complete', { page: pageNumber, blobType: blob.type, blobBytes: blob.size, blobEmpty: blob.size === 0, ...(await inspectExport(blob)) });
        } catch (error) {
          diagnosticLog('export-error', { page: pageNumber, error: diagnosticError(error) });
          throw error;
        }
        const url = URL.createObjectURL(blob);
        state.results.push({ blob, url, name: `${baseName(state.file.name)}-page-${pageNumber}.jpg`, pageNumber });
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

  function baseName(name) { return name.replace(/\.pdf$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'converted-pdf'; }

  function renderResults() {
    const fragment = document.createDocumentFragment();
    state.results.forEach(result => {
      const card = document.createElement('article');
      card.className = 'result-card';
      const heading = document.createElement('div');
      heading.className = 'result-card-heading';
      const title = document.createElement('h3');
      title.textContent = `Page ${result.pageNumber}`;
      const download = document.createElement('a');
      download.className = 'text-link';
      download.href = result.url;
      download.download = result.name;
      download.textContent = 'Download JPG →';
      download.setAttribute('aria-label', `Download JPG for page ${result.pageNumber}`);
      heading.append(title, download);
      const image = document.createElement('img');
      image.src = result.url;
      image.alt = `Preview of page ${result.pageNumber} converted to JPG`;
      image.loading = 'lazy';
      card.append(heading, image);
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
      triggerDownload(zipUrl, `${baseName(state.file.name)}-jpg-pages.zip`);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
    } catch (error) {
      showError('All JPGs could not be packaged. Please download the pages individually.');
    } finally {
      state.busy = false;
      button.disabled = false;
      button.textContent = 'Download All JPGs';
    }
  }

  function triggerDownload(url, name) {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
  }

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

