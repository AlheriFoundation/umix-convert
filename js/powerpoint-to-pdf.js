(() => {
  'use strict';

  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_SLIDES = 100;
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const state = { file: null, parsed: null, outputUrl: null, busy: false, token: 0 };
  const parser = window.pptxParser;

  if (!zone || !input || !parser || typeof parser.pptxToHtml !== 'function' || !window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
    if (errorBox) showError('This tool could not load its PowerPoint or PDF rendering libraries. Please refresh the page and try again.');
    return;
  }

  function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
  function clearError() { showError(''); }
  function formatBytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function safeBase(name) { return name.replace(/\.pptx$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'presentation'; }
  function validateFile(file) { if (!file) return 'Please select a PowerPoint presentation.'; if (!/\.pptx$/i.test(file.name)) return 'Please select a .pptx presentation. Legacy .ppt files are not supported.'; if (!file.size) return 'This presentation is empty or invalid.'; if (file.size > MAX_FILE_SIZE) return 'This presentation is larger than the 25 MB limit.'; return ''; }
  function setProgress(value, label, count = '') { const bar = $('[data-progress-bar]'); bar.style.width = `${value}%`; bar.parentElement.setAttribute('aria-valuenow', String(value)); $('[data-processing-label]').textContent = label; $('[data-processing-count]').textContent = count; }
  function showProcessing(show) { $('[data-processing]').hidden = !show; }
  function revokeOutput() { if (state.outputUrl) URL.revokeObjectURL(state.outputUrl); state.outputUrl = null; $('[data-download]').removeAttribute('href'); }
  function clearDocument() { state.token += 1; state.busy = false; state.file = null; state.parsed = null; revokeOutput(); }
  function resetView() { input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-summary]').hidden = true; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-slide-count]').textContent = '0'; $('[data-slide-size]').textContent = 'Unknown'; $('[data-output-name]').textContent = 'presentation.pdf'; $('[data-result-meta]').textContent = ''; setProgress(0, 'Reading presentation...'); showProcessing(false); clearError(); }
  function hasPptxSignature(buffer) { const bytes = new Uint8Array(buffer.slice(0, 4)); return bytes[0] === 80 && bytes[1] === 75 && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7) && (bytes[3] === 4 || bytes[3] === 6 || bytes[3] === 8); }
  function slideSizeText(size) { if (!size || !size.width || !size.height) return 'Unknown'; const ratio = size.width / size.height; return `${Math.round(size.width)} × ${Math.round(size.height)} (${ratio.toFixed(2)}:1)`; }
  function sanitizeSlideHtml(html) { const parsed = new DOMParser().parseFromString(`<div>${String(html || '')}</div>`, 'text/html'); const wrapper = parsed.body.firstElementChild; wrapper.querySelectorAll('script, iframe, object, embed, link, meta, form').forEach(node => node.remove()); wrapper.querySelectorAll('*').forEach(node => { [...node.attributes].forEach(attribute => { if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name); if ((attribute.name === 'href' || attribute.name === 'src') && /^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name); }); }); return wrapper; }
  function createRenderTarget(slideHtml, cssText, width, height) { const target = document.createElement('div'); target.className = 'pptx-pdf-render-target'; target.style.width = `${width}px`; target.style.height = `${height}px`; target.style.position = 'fixed'; target.style.left = '-100000px'; target.style.top = '0'; target.style.overflow = 'hidden'; target.style.background = '#fff'; const style = document.createElement('style'); style.textContent = String(cssText || ''); target.append(style, sanitizeSlideHtml(slideHtml)); document.body.append(target); return target; }
  function yieldBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }

  async function handleFiles(files) {
    if (state.busy) return; clearError(); input.value = ''; if (files.length > 1) { showError('Please select one presentation at a time.'); return; } const problem = validateFile(files[0]); if (problem) { showError(problem); return; }
    clearDocument(); resetView(); state.busy = true; const token = ++state.token; state.file = files[0]; $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} · Reading presentation...`; $('[data-file-summary]').hidden = false; zone.hidden = true; showProcessing(true); setProgress(8, 'Reading presentation...');
    try {
      const buffer = await state.file.arrayBuffer(); if (!hasPptxSignature(buffer)) throw new Error('invalid-format'); setProgress(20, 'Parsing slides...'); const parsed = await parser.pptxToHtml(buffer, { mediaProcess: true, themeProcess: true }); if (token !== state.token) return; if (!parsed || !Array.isArray(parsed.slides) || !parsed.slides.length) throw new Error('empty-presentation'); state.parsed = parsed; $('[data-slide-count]').textContent = parsed.slides.length; $('[data-slide-size]').textContent = slideSizeText(parsed.slideSize); $('[data-output-name]').textContent = `${safeBase(state.file.name)}.pdf`; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} · ${parsed.slides.length} ${parsed.slides.length === 1 ? 'slide' : 'slides'} · Ready to convert`; $('[data-summary]').hidden = false; $('[data-actions]').hidden = false; setProgress(100, 'Presentation ready.'); showProcessing(false);
    } catch (error) { clearDocument(); resetView(); showError(error.message === 'invalid-format' ? 'The file content does not match a valid .pptx presentation.' : error.message === 'empty-presentation' ? 'This presentation contains no readable slides.' : 'Unable to read this presentation. It may be corrupted, unsupported, or use features this browser renderer cannot process.'); }
    finally { if (token === state.token) { state.busy = false; showProcessing(false); } }
  }

  function pdfDimensions(slideSize) { const width = Number(slideSize?.width) || 1280; const height = Number(slideSize?.height) || 720; const maxDimension = 720; const scale = Math.min(maxDimension / width, maxDimension / height); const renderScale = Math.min(1, 1600 / width, 1000 / height); return { width: width * scale, height: height * scale, renderWidth: Math.max(320, Math.round(width * renderScale)), renderHeight: Math.max(180, Math.round(height * renderScale)) }; }
  function addPageNumber(doc) { const total = doc.getNumberOfPages(); if (total < 2) return; for (let page = 1; page <= total; page += 1) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(100); doc.text(`Slide ${page} of ${total}`, doc.internal.pageSize.getWidth() - 18, doc.internal.pageSize.getHeight() - 12, { align: 'right' }); } doc.setTextColor(0); }
  async function convertDocument() {
    if (!state.file || !state.parsed || state.busy) return; clearError(); state.busy = true; const token = ++state.token; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; showProcessing(true); setProgress(5, 'Preparing PDF...'); let doc = null; const dimensions = pdfDimensions(state.parsed.slideSize);
    try {
      doc = new window.jspdf.jsPDF({ unit: 'pt', format: [dimensions.width, dimensions.height], compress: true }); const slides = state.parsed.slides; for (let index = 0; index < slides.length; index += 1) { if (token !== state.token) return; const slide = slides[index]; setProgress(Math.round(8 + (index / slides.length) * 82), `Rendering slide ${index + 1} of ${slides.length}...`, `${index} of ${slides.length} complete`); const target = createRenderTarget(slide.html, state.parsed.globalCSS, dimensions.renderWidth, dimensions.renderHeight); try { const canvas = await window.html2canvas(target, { backgroundColor: '#ffffff', scale: Math.min(2, 1800 / dimensions.renderWidth), useCORS: false, logging: false, width: dimensions.renderWidth, height: dimensions.renderHeight }); if (token !== state.token) return; if (index > 0) doc.addPage([dimensions.width, dimensions.height]); doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, dimensions.width, dimensions.height, undefined, 'FAST'); } finally { target.remove(); } await yieldBrowser(); } addPageNumber(doc); setProgress(94, 'Validating PDF...'); const output = doc.output('blob'); const signature = new Uint8Array(await output.slice(0, 5).arrayBuffer()); if (output.type !== 'application/pdf' || output.size <= 0 || String.fromCharCode(...signature) !== '%PDF-') throw new Error('invalid-pdf'); if (token !== state.token) return; revokeOutput(); state.outputUrl = URL.createObjectURL(output); const name = `${safeBase(state.file.name)}.pdf`; const link = $('[data-download]'); link.href = state.outputUrl; link.download = name; link.textContent = 'Download PDF'; $('[data-result-meta]').textContent = `${slides.length} ${slides.length === 1 ? 'slide' : 'slides'} · ${formatBytes(output.size)}`; $('[data-result]').hidden = false; setProgress(100, 'PDF ready.');
    } catch (error) { if (token === state.token) { revokeOutput(); $('[data-actions]').hidden = false; showError(error.message === 'invalid-pdf' ? 'The renderer did not produce a valid PDF.' : 'We could not render this presentation. It may contain unsupported slide content or exceed browser memory limits.'); } }
    finally { if (token === state.token) { state.busy = false; showProcessing(false); if (!$('[data-result]').hidden) $('[data-actions]').hidden = true; else $('[data-actions]').hidden = false; } }
  }

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  $('[data-replace]').addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); input.click(); } });
  input.addEventListener('change', event => handleFiles([...event.target.files]));
  zone.addEventListener('click', () => { if (!state.busy) input.click(); });
  zone.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) handleFiles([...event.dataTransfer.files]); });
  $('[data-convert]').addEventListener('click', event => { if (state.parsed && state.parsed.slides.length > MAX_SLIDES) { event.stopImmediatePropagation(); showError(`This presentation contains more than the ${MAX_SLIDES}-slide limit.`); } }, true);
  $('[data-convert]').addEventListener('click', convertDocument);
  document.querySelectorAll('[data-reset], [data-reset-result]').forEach(button => button.addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); } }));
  window.addEventListener('beforeunload', clearDocument);
  resetView();
})();

