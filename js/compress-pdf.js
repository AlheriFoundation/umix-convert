(() => {
  'use strict';
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_PAGES = 50;
  const state = { file: null, pdf: null, source: null, outputUrl: null, busy: false, token: 0 };
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  if (!zone || !input || !window.pdfjsLib || !window.PDFLib) { if (errorBox) showError('This tool could not load its PDF processing libraries. Please refresh the page and try again.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  $('[data-replace]').addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); input.click(); } });
  input.addEventListener('change', event => handleFiles([...event.target.files]));
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) handleFiles([...event.dataTransfer.files]); });
  document.querySelectorAll('input[name="compression-level"]').forEach(radio => radio.addEventListener('change', () => { if (!state.busy) invalidateResult(); }));
  $('[data-compress]').addEventListener('click', compressPdf);
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); } }));

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function safeBase(name) { return name.replace(/\.pdf$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'document'; }
  function selectedLevel() { return document.querySelector('input[name="compression-level"]:checked').value; }
  function setProgress(value, label, count = '') { const bar = $('[data-progress-bar]'); bar.style.width = `${value}%`; bar.parentElement.setAttribute('aria-valuenow', String(value)); $('[data-processing-label]').textContent = label; $('[data-processing-count]').textContent = count; }
  function showProcessing(show) { $('[data-processing]').hidden = !show; }
  function validateFile(file) { if (!file) return 'Please select a valid PDF.'; if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name)) return 'Please select a valid PDF.'; if (!file.size) return 'This PDF is empty or invalid.'; if (file.size > MAX_FILE_SIZE) return 'This PDF exceeds the 25 MB limit.'; return ''; }

  async function handleFiles(files) {
    if (state.busy) return; clearError(); input.value = '';
    if (files.length > 1) { showError('Please select one PDF at a time.'); return; }
    const problem = validateFile(files[0]); if (problem) { showError(problem); return; }
    clearDocument(); resetView(); state.busy = true; const token = ++state.token; state.file = files[0]; $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} · Reading PDF…`; $('[data-file-info]').hidden = false; zone.hidden = true; showProcessing(true); setProgress(8, 'Reading PDF…');
    try {
      const pdf = await pdfjsLib.getDocument({ data: await state.file.arrayBuffer(), password: '' }).promise; if (token !== state.token) { await pdf.destroy(); return; } if (!pdf.numPages) throw new Error('invalid'); if (pdf.numPages > MAX_PAGES) throw new Error('page-limit'); state.pdf = pdf; setProgress(42, 'Analyzing PDF…'); state.source = await PDFLib.PDFDocument.load(await state.file.arrayBuffer()); if (token !== state.token) return; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} · ${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}`; $('[data-settings]').hidden = false; $('[data-actions]').hidden = false; showProcessing(false);
    } catch (error) { clearDocument(); resetView(); showError(error.message === 'page-limit' ? 'This PDF contains more than 50 pages.' : "We couldn't process this PDF. It may be corrupted or password-protected."); }
    finally { state.busy = false; }
  }

  async function compressPdf() {
    if (!state.file || !state.source || state.busy) return; clearError(); invalidateResult(); state.busy = true; const token = ++state.token; const level = selectedLevel(); $('[data-actions]').hidden = true; showProcessing(true); setProgress(12, 'Analyzing PDF…');
    try {
      await yieldBrowser(); if (token !== state.token) return; setProgress(35, 'Optimizing PDF…'); const working = await PDFLib.PDFDocument.load(await state.file.arrayBuffer()); const saveOptions = { useObjectStreams: level !== 'low' }; if (level === 'high') normalizeMetadata(working); await yieldBrowser(); if (token !== state.token) return; const bytes = await working.save(saveOptions); setProgress(72, 'Validating output…'); const output = new Blob([bytes], { type: 'application/pdf' }); const validation = await validateOutput(output, state.source.getPageCount()); if (token !== state.token) return; setProgress(100, 'Finalizing…'); state.outputUrl = URL.createObjectURL(output); renderResult(output, validation.pageCount);
    } catch (error) { invalidateResult(); showError(error.message === 'validation' ? "We couldn't create a valid optimized PDF. Please try another PDF." : 'We could not compress this PDF. Please try again with a valid, unencrypted PDF.'); $('[data-actions]').hidden = false; }
    finally { state.busy = false; showProcessing(false); if (!$('[data-result]').hidden) $('[data-actions]').hidden = true; else $('[data-actions]').hidden = false; }
  }
  function normalizeMetadata(pdf) { pdf.setTitle(''); pdf.setAuthor(''); pdf.setSubject(''); pdf.setKeywords([]); pdf.setCreator(''); pdf.setProducer(''); }
  async function validateOutput(blob, expectedPages) { if (!blob || blob.type !== 'application/pdf' || blob.size <= 0) throw new Error('validation'); const bytes = await blob.arrayBuffer(); const reloaded = await PDFLib.PDFDocument.load(bytes); const pageCount = reloaded.getPageCount(); if (pageCount !== expectedPages || !pageDimensionsMatch(state.source, reloaded)) throw new Error('validation'); return { pageCount }; }
  function pageDimensionsMatch(original, output) { const originalPages = original.getPages(); const outputPages = output.getPages(); if (originalPages.length !== outputPages.length) return false; return originalPages.every((page, index) => { const a = page.getSize(); const b = outputPages[index].getSize(); return Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01; }); }
  function renderResult(output, pageCount) { const originalSize = state.file.size; const compressedSize = output.size; const reduced = compressedSize < originalSize; const saved = originalSize - compressedSize; $('[data-result-heading]').textContent = reduced ? 'Compression complete' : 'No size reduction achieved'; $('[data-original-size]').textContent = formatBytes(originalSize); $('[data-original-pages]').textContent = `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`; $('[data-compressed-size]').textContent = formatBytes(compressedSize); $('[data-compressed-pages]').textContent = `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`; $('[data-result-size]').textContent = reduced ? `${formatBytes(saved)} · ${(saved / originalSize * 100).toFixed(1)}%` : 'No reduction'; $('[data-result-note]').textContent = reduced ? 'saved' : 'Compression did not reduce this PDF size.'; const download = $('[data-download]'); download.href = state.outputUrl; download.download = `${safeBase(state.file.name)}-compressed.pdf`; download.textContent = reduced ? 'Download Compressed PDF' : 'Download Optimized PDF'; $('[data-result]').hidden = false; }
  function invalidateResult() { if (state.outputUrl) URL.revokeObjectURL(state.outputUrl); state.outputUrl = null; $('[data-download]').removeAttribute('href'); $('[data-result]').hidden = true; }
  function clearDocument() { state.token += 1; if (state.pdf && state.pdf.destroy) Promise.resolve(state.pdf.destroy()).catch(() => {}); state.pdf = null; state.source = null; state.file = null; invalidateResult(); }
  function resetView() { input.value = ''; zone.hidden = false; $('[data-file-info]').hidden = true; $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-settings]').hidden = true; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; setProgress(0, 'Preparing PDF…'); showProcessing(false); clearError(); }
  function yieldBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }
})();

