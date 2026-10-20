(() => {
  'use strict';
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const state = { file: null, pdfUrl: null, previewReady: false, busy: false, token: 0 };
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const librariesReady = Boolean(window.JSZip && window.docx && window.docx.renderAsync && window.jspdf && window.jspdf.jsPDF && window.html2canvas && window.pdfjsLib);
  if (!zone || !input || !librariesReady) { if (errorBox) showError('This tool could not load its document conversion libraries. Please refresh the page and try again.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  $('[data-replace]').addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); input.click(); } });
  input.addEventListener('change', event => handleFiles([...event.target.files]));
  zone.addEventListener('click', () => { if (!state.busy) input.click(); });
  zone.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) handleFiles([...event.dataTransfer.files]); });
  $('[data-convert]').addEventListener('click', convertDocument);
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); } }));

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function safeBase(name) { return name.replace(/\.docx$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'document'; }
  function setProgress(value, label) { const bar = $('[data-progress-bar]'); bar.style.width = `${value}%`; bar.parentElement.setAttribute('aria-valuenow', String(value)); $('[data-processing-label]').textContent = label; }
  function showProcessing(show) { $('[data-processing]').hidden = !show; }
  function validateFile(file) { if (!file) return 'Please select a DOCX file.'; if (!/\.docx$/i.test(file.name) || (file.type && file.type !== DOCX_MIME && file.type !== 'application/octet-stream')) return 'Please select a valid DOCX file. PDF, image, spreadsheet, and text files are not supported.'; if (!file.size) return 'This DOCX file is empty or invalid.'; if (file.size > MAX_FILE_SIZE) return 'This file is larger than the 25 MB limit.'; return ''; }

  async function handleFiles(files) {
    if (state.busy) return; clearError(); input.value = ''; if (files.length > 1) { showError('Please select one DOCX file at a time.'); return; } const problem = validateFile(files[0]); if (problem) { showError(problem); return; }
    clearDocument(); resetView(); state.busy = true; const token = ++state.token; state.file = files[0]; $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `DOCX · ${formatBytes(state.file.size)} · Reading…`; $('[data-file-summary]').hidden = false; zone.hidden = true; showProcessing(true); setProgress(10, 'Reading Word document…');
    try {
      const preview = $('[data-preview]');
      $('[data-preview-panel]').hidden = false;
      await renderDocx(state.file, preview);
      if (token !== state.token) return;
      if (!getDocumentPages(preview).length) throw new Error('empty');
      state.previewReady = true;
      $('[data-file-meta]').textContent = `DOCX · ${formatBytes(state.file.size)} · Layout ready`;
      $('[data-actions]').hidden = false;
      showProcessing(false);
    }
    catch (error) { clearDocument(); resetView(); showError("We couldn't read this DOCX file. It may be corrupted, unsupported, or password-protected."); }
    finally { state.busy = false; }
  }
  async function convertDocument() {
    if (!state.file || !state.previewReady || state.busy) return; clearError(); state.busy = true; const token = ++state.token; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; showProcessing(true); setProgress(12, 'Preparing document layout…');
    let renderTarget = null;
    try {
      if (token !== state.token) return;
      renderTarget = createRenderTarget();
      await renderDocx(state.file, renderTarget);
      const pages = getDocumentPages(renderTarget);
      if (!pages.length) throw new Error('empty-render');
      setProgress(30, 'Rendering Word pages to PDF…');
      const doc = await renderPagesToPdf(pages, token);
      if (!doc || token !== state.token) return;
      renderTarget.remove();
      renderTarget = null;
      setProgress(78, 'Validating PDF…');
      const raw = doc.output('blob');
      const output = raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' });
      const pageCount = await validatePdf(output);
      if (token !== state.token) return;
      setProgress(100, 'PDF ready.');
      state.pdfUrl = URL.createObjectURL(output);
      const link = $('[data-download]');
      link.href = state.pdfUrl;
      link.download = `${safeBase(state.file.name)}.pdf`;
      link.textContent = 'Download PDF';
      $('[data-result-meta]').textContent = `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${formatBytes(output.size)}`;
      $('[data-result]').hidden = false;
    }
    catch (error) { if (renderTarget) renderTarget.remove(); revokePdfUrl(); showError("We couldn't create a valid PDF from this document. Please try another DOCX file."); $('[data-actions]').hidden = false; }
    finally { state.busy = false; showProcessing(false); if (!$('[data-result]').hidden) $('[data-actions]').hidden = true; else $('[data-actions]').hidden = false; }
  }
  const renderOptions = {
    className: 'docx',
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    useBase64URL: true
  };
  async function renderDocx(file, target) {
    const { data, pageNumberMarker } = await prepareDocxForRender(file);
    await window.docx.renderAsync(data, target, target, renderOptions);
    if (pageNumberMarker) applyPageNumbers(target, pageNumberMarker);
    await waitForRender(target);
  }
  async function prepareDocxForRender(file) {
    const originalData = await file.arrayBuffer();
    const zip = await window.JSZip.loadAsync(originalData);
    const marker = `UMIXPAGEFIELD${Date.now()}${Math.random().toString(36).slice(2)}END`;
    let hasPageFields = false;
    const xmlFiles = Object.values(zip.files).filter(entry => !entry.dir && /^word\/(?:header|footer)[^/]*\.xml$/i.test(entry.name));
    for (const entry of xmlFiles) {
      const xml = await entry.async('string');
      const updatedXml = markPageFields(xml, marker);
      if (updatedXml !== xml) {
        zip.file(entry.name, updatedXml);
        hasPageFields = true;
      }
    }
    return {
      data: hasPageFields ? await zip.generateAsync({ type: 'arraybuffer' }) : originalData,
      pageNumberMarker: hasPageFields ? marker : ''
    };
  }
  function markPageFields(xml, marker) {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.querySelector('parsererror')) throw new Error('invalid-docx-xml');
    const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const walker = document.createTreeWalker(parsed, NodeFilter.SHOW_ELEMENT);
    const fields = [];
    let changed = false;
    while (walker.nextNode()) {
      const element = walker.currentNode;
      if (element.namespaceURI !== wordNamespace) continue;
      if (element.localName === 'fldSimple') {
        const instruction = element.getAttributeNS(wordNamespace, 'instr') || element.getAttribute('w:instr') || '';
        if (/^\s*PAGE(?:\s|$)/i.test(instruction)) {
          const textNodes = [...element.getElementsByTagNameNS(wordNamespace, 't')];
          textNodes.forEach((node, index) => { node.textContent = index === 0 ? marker : ''; });
          if (textNodes.length) changed = true;
        }
      } else if (element.localName === 'fldChar') {
        const fieldType = element.getAttributeNS(wordNamespace, 'fldCharType') || element.getAttribute('w:fldCharType');
        if (fieldType === 'begin') fields.push({ instruction: '', page: false, result: false, marked: false });
        else if (fieldType === 'separate' && fields.length) {
          const field = fields[fields.length - 1];
          field.page = /^\s*PAGE(?:\s|$)/i.test(field.instruction);
          field.result = true;
        } else if (fieldType === 'end' && fields.length) fields.pop();
      } else if (element.localName === 'instrText' && fields.length) {
        const field = fields[fields.length - 1];
        if (!field.result) field.instruction += element.textContent;
      } else if (element.localName === 't' && fields.some(field => field.page && field.result)) {
        const field = [...fields].reverse().find(item => item.page && item.result);
        if (!field.marked) {
          element.textContent = marker;
          field.marked = true;
        } else element.textContent = '';
        changed = true;
      }
    }
    return changed ? new XMLSerializer().serializeToString(parsed) : xml;
  }
  function applyPageNumbers(target, marker) {
    const pages = getDocumentPages(target);
    pages.forEach((page, index) => {
      const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        if (textNode.nodeValue.includes(marker)) textNode.nodeValue = textNode.nodeValue.replaceAll(marker, String(index + 1));
      }
    });
  }
  function getDocumentPages(target) { return [...target.querySelectorAll('.docx-wrapper > section.docx')]; }
  function createRenderTarget() { const target = document.createElement('div'); target.className = 'word-pdf-render-target'; document.body.append(target); return target; }
  async function waitForRender(target) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const images = [...target.querySelectorAll('img')];
    await Promise.all(images.map(image => image.complete ? image.decode().catch(() => {}) : new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!target.scrollWidth || !target.scrollHeight) throw new Error('empty-render');
  }
  async function renderPagesToPdf(pages, token) {
    let doc = null;
    for (let index = 0; index < pages.length; index += 1) {
      if (token !== state.token) return null;
      const page = pages[index];
      const bounds = page.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const scale = Math.min(2, 4096 / width, 4096 / height, Math.sqrt(16000000 / (width * height)));
      const canvas = await window.html2canvas(page, {
        scale,
        backgroundColor: '#ffffff',
        useCORS: false,
        logging: false,
        scrollX: 0,
        scrollY: 0
      });
      try {
        if (!canvasHasContent(canvas)) throw new Error('empty-render');
        const pageWidth = width * 0.75;
        const pageHeight = height * 0.75;
        if (!doc) doc = new window.jspdf.jsPDF({ unit: 'pt', format: [pageWidth, pageHeight], compress: true });
        else doc.addPage([pageWidth, pageHeight]);
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
      setProgress(30 + Math.round((index + 1) / pages.length * 42), `Rendering page ${index + 1} of ${pages.length}…`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!doc) throw new Error('empty-render');
    return doc;
  }
  function canvasHasContent(canvas) { const context = canvas.getContext('2d', { willReadFrequently: true }); const step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 160)); const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data; for (let y = 0; y < canvas.height; y += step) for (let x = 0; x < canvas.width; x += step) { const offset = (y * canvas.width + x) * 4; if (pixels[offset + 3] > 0 && pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 735) return true; } return false; }
  async function renderHtmlToPdf(doc, target) {
    await waitForRender(target);
    await new Promise((resolve, reject) => {
      try {
        doc.html(target, {
          x: 36,
          y: 36,
          width: 523,
          windowWidth: target.scrollWidth,
          windowHeight: target.scrollHeight,
          margin: [36, 36, 36, 36],
          autoPaging: 'text',
          html2canvas: {
            scale: 1,
            useCORS: false,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            onclone: clonedDocument => {
              const overlay = clonedDocument.querySelector('.html2pdf__overlay');
              if (overlay) overlay.style.left = '0';
            }
          },
          callback: resolve
        });
      } catch (error) { reject(error); }
    });
    if (!doc.getNumberOfPages()) throw new Error('empty-render');
  }
  async function validatePdf(blob) { if (!blob || blob.type !== 'application/pdf' || blob.size <= 0) throw new Error('invalid-pdf'); const loadingTask = pdfjsLib.getDocument({ data: await blob.arrayBuffer() }); const pdf = await loadingTask.promise; const pageCount = pdf.numPages; if (!pageCount) throw new Error('empty-pdf'); const firstPage = await pdf.getPage(1); const viewport = firstPage.getViewport({ scale: 1 }); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); try { await firstPage.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise; if (!canvasHasContent(canvas)) throw new Error('empty-pdf'); } finally { canvas.width = 1; canvas.height = 1; if (pdf.destroy) await pdf.destroy(); } return pageCount; }
  function revokePdfUrl() { if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl); state.pdfUrl = null; $('[data-download]').removeAttribute('href'); }
  function clearDocument() { state.token += 1; state.file = null; state.previewReady = false; revokePdfUrl(); }
  function resetView() { input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-preview-panel]').hidden = true; $('[data-preview]').replaceChildren(); $('[data-actions]').hidden = true; $('[data-result]').hidden = true; setProgress(0, 'Preparing document…'); showProcessing(false); clearError(); }
})();
