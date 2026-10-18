(() => {
  'use strict';
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const state = { file: null, pdfUrl: null, previewReady: false, busy: false, token: 0 };
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const librariesReady = Boolean(window.mammoth && window.jspdf && window.jspdf.jsPDF && window.html2canvas && window.pdfjsLib);
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
    try { const result = await mammoth.convertToHtml({ arrayBuffer: await state.file.arrayBuffer() }, { convertImage: mammoth.images.imgElement(image => image.read('base64').then(data => ({ src: `data:${image.contentType};base64,${data}` }))) }); if (token !== state.token) return; setProgress(50, 'Extracting document content…'); const html = sanitizeHtml(result.value); if (!html.textContent.trim() && !html.querySelector('img, table, svg')) throw new Error('empty'); const preview = $('[data-preview]'); preview.replaceChildren(html); state.previewReady = true; $('[data-file-meta]').textContent = `DOCX · ${formatBytes(state.file.size)} · Content ready`; $('[data-preview-panel]').hidden = false; $('[data-actions]').hidden = false; showProcessing(false); }
    catch (error) { clearDocument(); resetView(); showError("We couldn't read this DOCX file. It may be corrupted, unsupported, or password-protected."); }
    finally { state.busy = false; }
  }
  function sanitizeHtml(html) { const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'); parsed.querySelectorAll('script, iframe, object, embed, link, meta, style').forEach(node => node.remove()); const wrapper = document.createElement('div'); while (parsed.body.firstChild && parsed.body.firstChild.firstChild) wrapper.append(parsed.body.firstChild.firstChild); return wrapper; }
  async function convertDocument() {
    if (!state.file || !state.previewReady || state.busy) return; clearError(); state.busy = true; const token = ++state.token; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; showProcessing(true); setProgress(12, 'Preparing document layout…');
    let renderTarget = null;
    try { if (token !== state.token) return; renderTarget = createRenderTarget(); setProgress(35, 'Generating PDF…'); const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true }); await renderHtmlToPdf(doc, renderTarget); if (token !== state.token) return; renderTarget.remove(); renderTarget = null; setProgress(78, 'Validating PDF…'); const raw = doc.output('blob'); const output = raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' }); const pageCount = await validatePdf(output); if (token !== state.token) return; setProgress(100, 'PDF ready.'); state.pdfUrl = URL.createObjectURL(output); const link = $('[data-download]'); link.href = state.pdfUrl; link.download = `${safeBase(state.file.name)}.pdf`; link.textContent = 'Download PDF'; $('[data-result-meta]').textContent = `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${formatBytes(output.size)}`; $('[data-result]').hidden = false; }
    catch (error) { if (renderTarget) renderTarget.remove(); revokePdfUrl(); showError("We couldn't create a valid PDF from this document. Please try another DOCX file."); $('[data-actions]').hidden = false; }
    finally { state.busy = false; showProcessing(false); if (!$('[data-result]').hidden) $('[data-actions]').hidden = true; else $('[data-actions]').hidden = false; }
  }
  function createRenderTarget() { const target = document.createElement('div'); target.className = 'word-pdf-render-target'; target.innerHTML = $('[data-preview]').innerHTML; document.body.append(target); return target; }
  async function waitForRender(target) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const images = [...target.querySelectorAll('img')];
    await Promise.all(images.map(image => image.complete ? image.decode().catch(() => {}) : new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!target.scrollWidth || !target.scrollHeight) throw new Error('empty-render');
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
  async function validatePdf(blob) { if (!blob || blob.type !== 'application/pdf' || blob.size <= 0) throw new Error('invalid-pdf'); const loadingTask = pdfjsLib.getDocument({ data: await blob.arrayBuffer() }); const pdf = await loadingTask.promise; const pageCount = pdf.numPages; if (!pageCount) throw new Error('empty-pdf'); const firstPage = await pdf.getPage(1); const text = await firstPage.getTextContent(); if (!text.items.some(item => item.str && item.str.trim())) throw new Error('empty-pdf'); const viewport = firstPage.getViewport({ scale: 1 }); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); await firstPage.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise; if (!canvasHasContent(canvas)) throw new Error('empty-pdf'); if (pdf.destroy) await pdf.destroy(); return pageCount; }
  function revokePdfUrl() { if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl); state.pdfUrl = null; $('[data-download]').removeAttribute('href'); }
  function clearDocument() { state.token += 1; state.file = null; state.previewReady = false; revokePdfUrl(); }
  function resetView() { input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-preview-panel]').hidden = true; $('[data-preview]').replaceChildren(); $('[data-actions]').hidden = true; $('[data-result]').hidden = true; setProgress(0, 'Preparing document…'); showProcessing(false); clearError(); }
})();

