(() => {
  'use strict';

  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const PREVIEW_LIMIT = 12000;
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const state = { file: null, text: '', outputUrl: null, busy: false, token: 0 };

  if (!zone || !input || !window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) { if (errorBox) showError('This tool could not load its PDF rendering libraries. Please refresh the page and try again.'); return; }

  function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
  function clearError() { showError(''); }
  function formatBytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function safeBase(name) { return name.replace(/\.txt$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'document'; }
  function validateFile(file) { if (!file) return 'Please select a TXT file.'; if (!/\.txt$/i.test(file.name)) return 'Please select a plain .txt file.'; if (file.type && file.type !== 'text/plain' && file.type !== 'application/octet-stream') return 'This file is not recognized as plain text.'; if (!file.size) return 'This text file is empty.'; if (file.size > MAX_FILE_SIZE) return 'This text file is larger than the 25 MB limit.'; return ''; }
  function setProgress(value, label, count = '') { const bar = $('[data-progress-bar]'); bar.style.width = `${value}%`; bar.parentElement.setAttribute('aria-valuenow', String(value)); $('[data-processing-label]').textContent = label; $('[data-processing-count]').textContent = count; }
  function showProcessing(show) { $('[data-processing]').hidden = !show; }
  function revokeOutput() { if (state.outputUrl) URL.revokeObjectURL(state.outputUrl); state.outputUrl = null; $('[data-download]').removeAttribute('href'); }
  function clearDocument() { state.token += 1; state.busy = false; state.file = null; state.text = ''; revokeOutput(); }
  function resetView() { input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-preview-panel]').hidden = true; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-preview]').textContent = ''; $('[data-preview-note]').textContent = ''; $('[data-result-meta]').textContent = ''; setProgress(0, 'Reading text file...'); showProcessing(false); clearError(); }
  function decodeUtf8(buffer) { if (typeof TextDecoder !== 'function') throw new Error('encoding'); try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (error) { throw new Error('encoding'); } }
  function normaliseText(text) { return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    '); }
  function previewText(text) { return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}\n\n[Preview truncated. The complete text will be converted.]` : text; }
  function yieldBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }

  async function handleFiles(files) {
    if (state.busy) return; clearError(); input.value = ''; if (files.length > 1) { showError('Please select one text file at a time.'); return; } const problem = validateFile(files[0]); if (problem) { showError(problem); return; }
    clearDocument(); resetView(); state.busy = true; const token = ++state.token; state.file = files[0]; $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} Â· Reading text...`; $('[data-file-summary]').hidden = false; zone.hidden = true; showProcessing(true); setProgress(8, 'Reading text file...');
    try { const text = normaliseText(decodeUtf8(await state.file.arrayBuffer())); if (token !== state.token) return; if (!text.trim()) throw new Error('empty'); state.text = text; $('[data-preview]').textContent = previewText(text); $('[data-preview-note]').textContent = text.length > PREVIEW_LIMIT ? `Showing the first ${PREVIEW_LIMIT.toLocaleString()} characters. The full file will be included in the PDF.` : 'Plain text is rendered with browser fonts and kept as text content until PDF capture.'; $('[data-file-meta]').textContent = `${formatBytes(state.file.size)} Â· ${text.split('\n').length.toLocaleString()} lines Â· Ready to convert`; $('[data-preview-panel]').hidden = false; $('[data-actions]').hidden = false; setProgress(100, 'Text ready.'); showProcessing(false); }
    catch (error) { clearDocument(); resetView(); showError(error.message === 'empty' ? 'This text file contains no readable text.' : error.message === 'encoding' ? 'This file is not valid UTF-8 text. Please save it as UTF-8 and try again.' : 'Unable to read this text file. It may be unreadable or unsupported.'); }
    finally { if (token === state.token) { state.busy = false; showProcessing(false); } }
  }

  function splitLongLine(line, limit = 110) { const characters = Array.from(line); const pieces = []; for (let index = 0; index < characters.length; index += limit) pieces.push(characters.slice(index, index + limit).join('')); return pieces.length ? pieces : ['']; }
  function makeRenderPage(filename, pageNumber) { const page = document.createElement('div'); page.className = 'txt-pdf-render-page'; page.style.cssText = 'box-sizing:border-box;width:794px;height:1123px;padding:42px 64px 52px;background:#fff;color:#172033;font-family:"Segoe UI","Noto Sans",Arial,sans-serif;position:relative;overflow:hidden;'; const header = document.createElement('div'); header.textContent = filename; header.style.cssText = 'height:26px;color:#657089;font:600 11px/1.3 "Segoe UI","Noto Sans",Arial,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; const body = document.createElement('div'); body.className = 'txt-pdf-render-body'; body.style.cssText = 'height:1003px;overflow:hidden;font:14px/1.45 "Segoe UI","Noto Sans",Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;'; page.append(header, body); return { page, body, pageNumber }; }
  function buildRenderPages(text, filename) { const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-100000px;top:0;width:794px;z-index:-1;pointer-events:none;'; document.body.append(host); const pages = []; let current = makeRenderPage(filename, 1); host.append(current.page); pages.push(current); const lines = text.split('\n'); lines.forEach(line => { const chunks = splitLongLine(line); chunks.forEach(chunk => { const element = document.createElement('div'); element.textContent = chunk || ' '; element.style.minHeight = chunk ? '20px' : '9px'; element.style.marginBottom = chunk ? '2px' : '0'; current.body.append(element); if (current.body.scrollHeight > current.body.clientHeight && current.body.children.length > 1) { current.body.removeChild(element); current = makeRenderPage(filename, pages.length + 1); host.append(current.page); pages.push(current); current.body.append(element); } }); }); return { host, pages }; }
  function addPageNumbers(doc) { const total = doc.getNumberOfPages(); for (let page = 1; page <= total; page += 1) { doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100); doc.text(`Page ${page} of ${total}`, doc.internal.pageSize.getWidth() - 36, doc.internal.pageSize.getHeight() - 18, { align: 'right' }); } doc.setTextColor(0); }
  async function convertDocument() {
    if (!state.file || !state.text || state.busy) return; clearError(); state.busy = true; const token = ++state.token; $('[data-actions]').hidden = true; $('[data-result]').hidden = true; showProcessing(true); setProgress(5, 'Preparing PDF...'); let renderState = null;
    try { renderState = buildRenderPages(state.text, state.file.name); const dimensions = { width: 595.28, height: 841.89 }; const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true }); for (let index = 0; index < renderState.pages.length; index += 1) { if (token !== state.token) return; setProgress(Math.round(10 + (index / renderState.pages.length) * 82), `Rendering page ${index + 1} of ${renderState.pages.length}...`, `${index} of ${renderState.pages.length} complete`); const canvas = await window.html2canvas(renderState.pages[index].page, { backgroundColor: '#ffffff', scale: 1.5, useCORS: false, logging: false, width: 794, height: 1123 }); if (token !== state.token) return; if (index > 0) doc.addPage('a4', 'portrait'); doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, dimensions.width, dimensions.height, undefined, 'FAST'); await yieldBrowser(); } addPageNumbers(doc); setProgress(94, 'Validating PDF...'); const output = doc.output('blob'); const signature = new Uint8Array(await output.slice(0, 5).arrayBuffer()); if (output.type !== 'application/pdf' || output.size <= 0 || String.fromCharCode(...signature) !== '%PDF-') throw new Error('invalid-pdf'); if (token !== state.token) return; revokeOutput(); state.outputUrl = URL.createObjectURL(output); const name = `${safeBase(state.file.name)}.pdf`; const link = $('[data-download]'); link.href = state.outputUrl; link.download = name; link.textContent = 'Download PDF'; $('[data-result-meta]').textContent = `${renderState.pages.length} ${renderState.pages.length === 1 ? 'page' : 'pages'} Â· ${formatBytes(output.size)}`; $('[data-result]').hidden = false; setProgress(100, 'PDF ready.'); }
    catch (error) { if (token === state.token) { revokeOutput(); $('[data-actions]').hidden = false; showError(error.message === 'invalid-pdf' ? 'The renderer did not produce a valid PDF.' : 'We could not create a valid PDF from this text. The file may be too large for this browser.'); } }
    finally { if (renderState) renderState.host.remove(); if (token === state.token) { state.busy = false; showProcessing(false); if (!$('[data-result]').hidden) $('[data-actions]').hidden = true; else $('[data-actions]').hidden = false; } }
  }

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  $('[data-replace]').addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); input.click(); } });
  input.addEventListener('change', event => handleFiles([...event.target.files]));
  zone.addEventListener('click', () => { if (!state.busy) input.click(); });
  zone.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) handleFiles([...event.dataTransfer.files]); });
  $('[data-convert]').addEventListener('click', convertDocument);
  document.querySelectorAll('[data-reset], [data-reset-result]').forEach(button => button.addEventListener('click', () => { if (!state.busy) { clearDocument(); resetView(); } }));
  window.addEventListener('beforeunload', clearDocument);
  resetView();
})();

