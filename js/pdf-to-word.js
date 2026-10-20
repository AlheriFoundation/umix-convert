(() => {
  'use strict';

  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_PAGES = 50;
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const state = { file: null, pdf: null, pages: [], outputUrl: null, busy: false, token: 0 };

  if (!zone || !input || !window.pdfjsLib || !window.docx) { if (errorBox) showError('This tool could not load its PDF or Word document libraries. Please refresh the page and try again.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';

  function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; const status = $('[data-status]'); if (status) status.textContent = message; }
  function clearError() { showError(''); }
  function formatBytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function safeBase(name) { return name.replace(/\.pdf$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'document'; }
  function validate(file) { if (!file) return 'Please select a PDF file.'; if (!/\.pdf$/i.test(file.name)) return 'Please select a valid PDF file.'; if (!file.size) return 'This PDF is empty or invalid.'; if (file.size > MAX_FILE_SIZE) return 'This PDF is larger than the 25 MB limit.'; return ''; }
  function setProgress(value, label, count = '') { const bar = $('[data-progress-bar]'); bar.style.width = `${value}%`; bar.parentElement.setAttribute('aria-valuenow', String(value)); $('[data-processing-label]').textContent = label; $('[data-processing-count]').textContent = count; }
  function showProcessing(show) { $('[data-processing]').hidden = !show; }
  function revokeOutput() { if (state.outputUrl) URL.revokeObjectURL(state.outputUrl); state.outputUrl = null; $('[data-download]').removeAttribute('href'); }
  function destroyPdf() { if (state.pdf && typeof state.pdf.destroy === 'function') Promise.resolve(state.pdf.destroy()).catch(() => {}); state.pdf = null; }
  function clearDocument() { state.token += 1; state.busy = false; destroyPdf(); state.file = null; state.pages = []; revokeOutput(); }
  function resetView() { input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-summary]').hidden = true; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-page-count]').textContent = '0'; $('[data-text-pages]').textContent = '0'; $('[data-output-name]').textContent = 'document.docx'; $('[data-extraction-note]').textContent = ''; $('[data-result-meta]').textContent = ''; setProgress(0, 'Reading PDF...'); showProcessing(false); clearError(); }
  function meaningfulText(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
  function lineFor(lines, item, fontSize) { const y = Number(item.transform?.[5] || 0); return lines.find(line => Math.abs(line.y - y) <= Math.max(2, fontSize * .45)); }
  function buildLines(items) {
    const positioned = items.filter(item => meaningfulText(item.str)).map(item => ({ item, x: Number(item.transform?.[4] || 0), y: Number(item.transform?.[5] || 0), fontSize: Math.max(6, Math.abs(Number(item.transform?.[0] || item.transform?.[3] || 12))) })).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    positioned.forEach(part => { const line = lineFor(lines, part.item, part.fontSize); if (line) { line.parts.push(part); line.fontSize = Math.max(line.fontSize, part.fontSize); } else lines.push({ y: part.y, fontSize: part.fontSize, parts: [part] }); });
    return lines.sort((a, b) => b.y - a.y).map(line => { line.parts.sort((a, b) => a.x - b.x); let text = ''; let previous = null; line.parts.forEach(part => { const value = String(part.item.str || '').replace(/[\r\n\t]+/g, ' '); const gap = previous ? part.x - (previous.x + Number(previous.item.width || 0)) : 0; if (text && gap > Math.max(1.5, part.fontSize * .2) && !/^\s/.test(value) && !/\s$/.test(text)) text += ' '; text += value; previous = part; }); return { y: line.y, text: text.trim(), fontSize: line.fontSize }; }).filter(line => line.text); }
  function pageParagraphs(lines) { return lines.map((line, index) => { const previous = lines[index - 1]; const gap = previous ? Math.abs(previous.y - line.y) : 0; const normalLineHeight = line.fontSize * 1.2; return { ...line, spacingAfter: Math.max(0, Math.round((gap - normalLineHeight) * 20)) }; }); }
  function headingLevel(paragraph, medianSize) { if (paragraph.fontSize >= Math.max(18, medianSize * 1.35) && paragraph.text.length < 140) return paragraph.fontSize >= medianSize * 1.7 ? window.docx.HeadingLevel.HEADING_1 : window.docx.HeadingLevel.HEADING_2; return undefined; }
  function paragraphOptions(paragraph, medianSize) { const level = headingLevel(paragraph, medianSize); return level ? { text: paragraph.text, heading: level, spacing: { after: Math.max(120, paragraph.spacingAfter) } } : { text: paragraph.text, spacing: { after: paragraph.spacingAfter, line: 276 } }; }
  function createDocx(pages) {
    const { Document, Paragraph, PageOrientation, SectionType, Packer } = window.docx;
    const sections = pages.map(page => {
      const isLandscape = page.width > page.height;
      const sizes = page.paragraphs.map(paragraph => paragraph.fontSize).sort((a, b) => a - b);
      const median = sizes[Math.floor(sizes.length / 2)] || 12;
      const children = page.paragraphs.length
        ? page.paragraphs.map(paragraph => new Paragraph(paragraphOptions(paragraph, median)))
        : [new Paragraph({ text: '' })];
      return {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: {
              width: Math.round((isLandscape ? page.height : page.width) * 20),
              height: Math.round((isLandscape ? page.width : page.height) * 20),
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
            },
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children
      };
    });
    return { document: new Document({ sections }), Packer };
  }
  function yieldBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }
  async function handleFiles(files) {
    if (state.busy) return; clearError(); input.value = ''; if (files.length > 1) { showError('Please select one PDF at a time.'); return; } const problem = validate(files[0]); if (problem) { showError(problem); return; }
    clearDocument(); resetView(); state.busy = true; const token = ++state.token; state.file = files[0]; $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} · Reading PDF...`; $('[data-file-summary]').hidden = false; zone.hidden = true; showProcessing(true); setProgress(8, 'Reading PDF...');
    try {
      const buffer = await state.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer, password: '' }).promise;
      if (token !== state.token) { destroyPdfObject(pdf); return; }
      state.pdf = pdf;
      if (!pdf.numPages) throw new Error('invalid');
      if (pdf.numPages > MAX_PAGES) throw new Error('page-limit');
      const pages = [];
      let textPages = 0;
      for (let index = 1; index <= pdf.numPages; index += 1) {
        if (token !== state.token) return;
        setProgress(Math.round(10 + index / pdf.numPages * 80), `Extracting text from page ${index} of ${pdf.numPages}...`, `${index - 1} of ${pdf.numPages} complete`);
        const page = await pdf.getPage(index);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const paragraphs = pageParagraphs(buildLines(content.items || []));
        if (paragraphs.some(paragraph => meaningfulText(paragraph.text))) textPages += 1;
        pages.push({ paragraphs, width: viewport.width, height: viewport.height });
        if (typeof page.cleanup === 'function') page.cleanup();
        await yieldBrowser();
      }
      if (token !== state.token) return;
      destroyPdf();
      state.pages = pages;
      if (!textPages) throw new Error('no-text');
      $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} · ${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'} · Ready to convert`;
      $('[data-page-count]').textContent = pdf.numPages;
      $('[data-text-pages]').textContent = textPages;
      $('[data-output-name]').textContent = `${safeBase(state.file.name)}.docx`;
      $('[data-extraction-note]').textContent = textPages < pdf.numPages
        ? `${textPages} page${textPages === 1 ? '' : 's'} contain selectable text. Text on ${pdf.numPages - textPages} page${pdf.numPages - textPages === 1 ? '' : 's'} could not be extracted; scanned pages need OCR, which is not supported.`
        : 'Extracted text will be editable in Word. Layout, spacing, tables, and logos may need manual adjustment.';
      $('[data-summary]').hidden = false;
      $('[data-actions]').hidden = false;
      setProgress(100, 'PDF ready.');
      showProcessing(false);
    }
    catch (error) {
      destroyPdf();
      clearDocument();
      resetView();
      showError(error.message === 'page-limit' ? 'This PDF contains more than the 50-page limit.' : error.message === 'no-text' ? 'No selectable text could be extracted from this PDF. It may be scanned or image-based. OCR is not currently supported.' : error && error.name === 'PasswordException' ? 'This PDF is password-protected and cannot be converted here.' : 'Unable to read this PDF. It may be corrupted, invalid or unsupported.');
    }
    finally { if (token === state.token) { state.busy = false; showProcessing(false); } }
  }
  function destroyPdfObject(pdf) { if (pdf && typeof pdf.destroy === 'function') Promise.resolve(pdf.destroy()).catch(() => {}); }

  async function convertDocument() {
    if (!state.file || !state.pages.length || state.busy) return; clearError(); state.busy = true; const token = ++state.token; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; showProcessing(true); setProgress(60, 'Generating editable Word document...');
    try {
      if (token !== state.token) return;
      const { document, Packer } = createDocx(state.pages);
      setProgress(78, 'Packaging Word document...');
      const blob = await Packer.toBlob(document);
      if (token !== state.token) return;
      if (!blob || blob.size <= 0) throw new Error('docx');
      const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      if (header[0] !== 80 || header[1] !== 75) throw new Error('docx');
      destroyPdf();
      setProgress(100, 'Finalizing...');
      revokeOutput();
      state.outputUrl = URL.createObjectURL(blob);
      const name = `${safeBase(state.file.name)}.docx`;
      const link = $('[data-download]');
      link.href = state.outputUrl;
      link.download = name;
      link.textContent = 'Download Word Document';
      $('[data-result-meta]').textContent = `${state.file.name} · ${state.pages.length} ${state.pages.length === 1 ? 'page' : 'pages'} · ${name} · ${formatBytes(blob.size)}`;
      $('[data-result]').hidden = false;
    }
    catch (error) { if (token === state.token) { revokeOutput(); showError('We could not create the Word document. Please try another PDF or a smaller file.'); $('[data-actions]').hidden = false; } }
    finally { if (token === state.token) { state.busy = false; showProcessing(false); if (!$('[data-result]').hidden) $('[data-actions]').hidden = true; else $('[data-actions]').hidden = false; } }
  }

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); }); $('[data-replace]').addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); input.click(); } }); input.addEventListener('change', event => handleFiles([...event.target.files])); zone.addEventListener('click', () => { if (!state.busy) input.click(); }); zone.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); input.click(); } }); zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); }); zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging')); zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) handleFiles([...event.dataTransfer.files]); }); $('[data-convert]').addEventListener('click', convertDocument); document.querySelectorAll('[data-reset], [data-reset-result]').forEach(button => button.addEventListener('click', () => { clearDocument(); resetView(); })); window.addEventListener('beforeunload', () => { clearDocument(); });
  resetView();
})();
