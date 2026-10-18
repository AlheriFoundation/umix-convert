(() => {
  'use strict';
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_PAGES = 50;
  const state = { file: null, pdf: null, sourcePdf: null, pages: [], results: [], zipUrl: null, busy: false, token: 0 };
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  if (!zone || !input || !window.pdfjsLib || !window.PDFLib || !window.JSZip) { if (errorBox) showError('This tool could not load its PDF processing libraries. Please refresh the page and try again.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  $('[data-replace]').addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); input.click(); } });
  input.addEventListener('change', event => handleFiles([...event.target.files]));
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) handleFiles([...event.dataTransfer.files]); });
  $('[data-page-grid]').addEventListener('change', event => { if (!event.target.matches('input[data-page]') || state.busy) return; state.pages[Number(event.target.dataset.page)].selected = event.target.checked; invalidateResults(); renderPageGrid(); });
  $('[data-select-all]').addEventListener('click', () => { if (!state.busy) { state.pages.forEach(page => { page.selected = true; }); invalidateResults(); renderPageGrid(); } });
  $('[data-deselect-all]').addEventListener('click', () => { if (!state.busy) { state.pages.forEach(page => { page.selected = false; }); invalidateResults(); renderPageGrid(); } });
  document.querySelectorAll('input[name="split-method"]').forEach(radio => radio.addEventListener('change', () => { $('[data-range-field]').hidden = radioValue() !== 'ranges'; invalidateResults(); clearError(); }));
  $('[data-ranges]').addEventListener('input', () => { if (!state.busy) invalidateResults(); });
  $('[data-split]').addEventListener('click', splitPdf);
  $('[data-download-all]').addEventListener('click', downloadAll);
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); } }));

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function safeBase(name) { return name.replace(/\.pdf$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'document'; }
  function radioValue() { return document.querySelector('input[name="split-method"]:checked').value; }
  function validateFile(file) { if (!file) return 'Please select a valid PDF.'; if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name)) return 'Please select a valid PDF.'; if (file.size > MAX_FILE_SIZE) return 'This PDF exceeds the 25 MB limit.'; if (!file.size) return 'This PDF is empty or invalid.'; return ''; }
  function setProgress(value, label, count = '') { const bar = $('[data-progress-bar]'); bar.style.width = `${value}%`; bar.parentElement.setAttribute('aria-valuenow', String(value)); $('[data-processing-label]').textContent = label; $('[data-processing-count]').textContent = count; }
  function showProcessing(show) { $('[data-processing]').hidden = !show; }

  async function handleFiles(files) {
    if (state.busy) return;
    clearError(); input.value = '';
    if (files.length > 1) { showError('Please select one PDF at a time.'); return; }
    const problem = validateFile(files[0]); if (problem) { showError(problem); return; }
    clearDocument(); resetView(); state.busy = true; const token = ++state.token; state.file = files[0]; $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} · Reading PDF…`; $('[data-file-summary]').hidden = false; zone.hidden = true; showProcessing(true); setProgress(0, 'Loading PDF…');
    try {
      const buffer = await state.file.arrayBuffer(); const loadingTask = pdfjsLib.getDocument({ data: buffer, password: '' }); const pdf = await loadingTask.promise; if (token !== state.token) { await pdf.destroy(); return; } if (!pdf.numPages) throw new Error('invalid'); if (pdf.numPages > MAX_PAGES) throw new Error('page-limit'); state.pdf = pdf;
      try { state.sourcePdf = await PDFLib.PDFDocument.load(await state.file.arrayBuffer()); } catch (error) { throw new Error('password'); }
      state.pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) { if (token !== state.token) return; setProgress(Math.round((pageNumber - 1) / pdf.numPages * 100), `Rendering page ${pageNumber} of ${pdf.numPages}…`, `${pageNumber - 1} of ${pdf.numPages} complete`); let previewUrl = null; try { previewUrl = await renderPreview(pdf, pageNumber); } catch (error) { previewUrl = null; } state.pages.push({ pageNumber, previewUrl, selected: false }); }
      if (token !== state.token) return; $('[data-file-meta]').textContent = `${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'} · ${formatBytes(state.file.size)}`; setProgress(100, 'PDF ready.'); renderPageGrid(); $('[data-page-panel]').hidden = false; $('[data-settings]').hidden = false; $('[data-actions]').hidden = false; showProcessing(false);
    } catch (error) { clearDocument(); resetView(); showError(error.message === 'page-limit' ? 'This PDF contains more than 50 pages.' : "We couldn't read this PDF. It may be corrupted or password-protected."); }
    finally { state.busy = false; }
  }
  async function renderPreview(pdf, pageNumber) { const page = await pdf.getPage(pageNumber); const viewport = page.getViewport({ scale: 0.38 }); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const context = canvas.getContext('2d', { alpha: false }); if (!context) throw new Error('canvas'); await page.render({ canvasContext: context, viewport }).promise; if (page.cleanup) page.cleanup(); const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('thumbnail')), 'image/jpeg', 0.8)); canvas.width = canvas.height = 1; return URL.createObjectURL(blob); }
  function renderPageGrid() { const grid = $('[data-page-grid]'); const fragment = document.createDocumentFragment(); state.pages.forEach((page, index) => { const card = document.createElement('label'); card.className = `page-card${page.selected ? ' is-selected' : ''}`; const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.page = index; checkbox.checked = page.selected; checkbox.setAttribute('aria-label', `Select page ${page.pageNumber}`); const preview = document.createElement('div'); preview.className = 'page-preview'; if (page.previewUrl) { const image = document.createElement('img'); image.src = page.previewUrl; image.alt = `Preview of page ${page.pageNumber}`; image.loading = 'lazy'; preview.append(image); } else { preview.textContent = 'PDF'; preview.setAttribute('aria-label', `Preview unavailable for page ${page.pageNumber}`); } const caption = document.createElement('span'); caption.textContent = `Page ${page.pageNumber}`; card.append(checkbox, preview, caption); fragment.append(card); }); grid.replaceChildren(fragment); }

  function parseRanges(value, pageCount) {
    const text = value.trim(); if (!text) throw new Error('Please enter at least one page range.'); const groups = []; const seen = new Set();
    for (const rawPart of text.split(',')) { const part = rawPart.trim(); if (!part) throw new Error('Please enter valid page ranges.'); if (!/^\d+(?:\s*-\s*\d+)?$/.test(part)) throw new Error(`Page range ${part} is invalid.`); const pieces = part.split('-').map(valuePart => Number(valuePart.trim())); const start = pieces[0]; const end = pieces[1] === undefined ? start : pieces[1]; if (start < 1 || end < 1 || start > pageCount || end > pageCount || start > end) throw new Error(`Page range ${part} is invalid.`); const group = []; for (let page = start; page <= end; page += 1) { if (!seen.has(page)) { seen.add(page); group.push(page); } } if (group.length) groups.push(group); }
    if (!groups.length) throw new Error('Please enter at least one page range.'); return groups;
  }
  function selectedPages() { return state.pages.filter(page => page.selected).map(page => page.pageNumber); }
  function invalidateResults() { state.results.forEach(result => URL.revokeObjectURL(result.url)); state.results = []; revokeZip(); $('[data-results]').hidden = true; }
  function outputGroups() { const method = radioValue(); if (method === 'every') return state.pages.map(page => [page.pageNumber]); if (method === 'ranges') return parseRanges($('[data-ranges]').value, state.pages.length); const pages = selectedPages(); if (!pages.length) throw new Error('Please select at least one page.'); return [pages]; }
  async function splitPdf() {
    if (!state.file || !state.sourcePdf || state.busy) return; clearError(); let groups; try { groups = outputGroups(); } catch (error) { showError(error.message); return; }
    state.busy = true; const token = ++state.token; const method = radioValue(); $('[data-actions]').hidden = true; $('[data-results]').hidden = true; showProcessing(true); const used = new Set(); const base = safeBase(state.file.name); try { for (let index = 0; index < groups.length; index += 1) { if (token !== state.token) return; setProgress(Math.round(index / groups.length * 90), `Creating output ${index + 1} of ${groups.length}…`, `${index} of ${groups.length} complete`); const output = await createPdf(groups[index]); const name = method === 'selected' ? `${base}-selected-pages.pdf` : method === 'every' ? `${base}-page-${groups[index][0]}.pdf` : `${base}-part-${index + 1}.pdf`; if (!used.has(name)) { used.add(name); state.results.push({ blob: output, url: URL.createObjectURL(output), name, pageCount: groups[index].length }); } await yieldBrowser(); }
      if (token !== state.token) return; setProgress(100, 'Split complete.'); renderResults(); $('[data-results]').hidden = false;
    } catch (error) { invalidateResults(); showError('We could not create the split PDF files. Please try again with a valid, unencrypted PDF.'); $('[data-actions]').hidden = false; }
    finally { state.busy = false; showProcessing(false); if (!$('[data-results]').hidden) $('[data-actions]').hidden = true; else $('[data-actions]').hidden = false; }
  }
  async function createPdf(pageNumbers) { const output = await PDFLib.PDFDocument.create(); const copied = await output.copyPages(state.sourcePdf, pageNumbers.map(pageNumber => pageNumber - 1)); copied.forEach(page => output.addPage(page)); const bytes = await output.save(); return new Blob([bytes], { type: 'application/pdf' }); }
  function renderResults() { const list = $('[data-results-list]'); const fragment = document.createDocumentFragment(); $('[data-result-count]').textContent = state.results.length; state.results.forEach(result => { const row = document.createElement('article'); row.className = 'split-result-row'; const details = document.createElement('div'); details.className = 'split-result-details'; const name = document.createElement('strong'); name.textContent = result.name; const meta = document.createElement('span'); meta.textContent = `${result.pageCount} ${result.pageCount === 1 ? 'page' : 'pages'} · ${formatBytes(result.blob.size)}`; details.append(name, meta); const link = document.createElement('a'); link.className = 'button button-secondary button-small'; link.href = result.url; link.download = result.name; link.textContent = 'Download PDF'; link.setAttribute('aria-label', `Download ${result.name}`); row.append(details, link); fragment.append(row); }); list.replaceChildren(fragment); $('[data-download-all]').hidden = state.results.length < 2; }
  async function downloadAll() { if (!state.results.length || state.busy) return; const button = $('[data-download-all]'); state.busy = true; button.disabled = true; button.textContent = 'Preparing ZIP…'; try { const zip = new JSZip(); state.results.forEach(result => zip.file(result.name, result.blob)); revokeZip(); state.zipUrl = URL.createObjectURL(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })); const link = document.createElement('a'); link.href = state.zipUrl; link.download = 'split-pdf-files.zip'; link.click(); const url = state.zipUrl; setTimeout(() => { if (state.zipUrl === url) revokeZip(); }, 1000); } catch (error) { showError('The ZIP could not be created. Please download the PDF files individually.'); } finally { state.busy = false; button.disabled = false; button.textContent = 'Download All ZIP'; } }
  function revokeZip() { if (state.zipUrl) URL.revokeObjectURL(state.zipUrl); state.zipUrl = null; }
  function clearDocument() { state.token += 1; if (state.pdf && state.pdf.destroy) Promise.resolve(state.pdf.destroy()).catch(() => {}); state.pages.forEach(page => { if (page.previewUrl) URL.revokeObjectURL(page.previewUrl); }); state.pdf = null; state.sourcePdf = null; state.file = null; state.pages = []; invalidateResults(); }
  function resetView() { input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-page-panel]').hidden = true; $('[data-settings]').hidden = true; $('[data-actions]').hidden = true; $('[data-results]').hidden = true; $('[data-page-grid]').replaceChildren(); $('[data-results-list]').replaceChildren(); $('[data-ranges]').value = ''; document.querySelector('input[name="split-method"][value="selected"]').checked = true; $('[data-range-field]').hidden = true; setProgress(0, 'Preparing PDF…'); showProcessing(false); clearError(); }
  function yieldBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }
})();

