(() => {
  'use strict';
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const MAX_PAGES = 50;
  const state = { file: null, pdf: null, buffer: null, busy: false, token: 0 };
  const $ = selector => document.querySelector(selector);
  const zone = $('[data-upload-zone]');
  const input = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  if (!zone || !input || !window.pdfjsLib) { if (errorBox) showError('The required PDF processing library could not be loaded. Please try again.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';
  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); if (!state.busy) input.click(); });
  zone.addEventListener('click', () => { if (!state.busy) input.click(); });
  zone.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-dragging'); if (!state.busy) handleFiles([...event.dataTransfer.files]); });
  input.addEventListener('change', event => handleFiles([...event.target.files]));
  $('[data-replace]').addEventListener('click', () => { if (!state.busy) { resetTool(); input.click(); } });
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => { if (!state.busy) resetTool(); }));
  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; $('[data-status]').textContent = message; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function bytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(2)} MB`; }
  function validate(file) { if (!file) return 'Please select a PDF file.'; if (file.type && file.type !== 'application/pdf' && file.type !== 'application/octet-stream') return 'Please select a valid PDF file.'; if (!/\.pdf$/i.test(file.name)) return 'Please select a valid PDF file.'; if (!file.size) return 'This PDF is empty or invalid.'; if (file.size > MAX_FILE_SIZE) return 'File is larger than the 25 MB limit.'; return ''; }
  async function handleFiles(files) {
    if (state.busy) return; clearError(); input.value = '';
    if (files.length > 1) { showError('Please select one PDF at a time.'); return; }
    const problem = validate(files[0]); if (problem) { showError(problem); return; }
    resetTool(); state.busy = true; const token = ++state.token; state.file = files[0]; $('[data-file-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${bytes(state.file.size)} · Reading PDF…`; $('[data-file-summary]').hidden = false; zone.hidden = true; $('[data-processing]').hidden = false; $('[data-status]').textContent = 'Reading PDF…';
    try { state.buffer = await state.file.arrayBuffer(); const loadingTask = pdfjsLib.getDocument({ data: state.buffer, password: '' }); const pdf = await loadingTask.promise; if (token !== state.token) { await pdf.destroy(); return; } state.pdf = pdf; $('[data-status]').textContent = 'Checking pages…'; if (pdf.numPages > MAX_PAGES) throw new Error('page-limit'); const count = pdf.numPages; $('[data-page-count]').textContent = count; $('[data-page-label]').textContent = count === 1 ? 'Page' : 'Pages'; $('[data-result-name]').textContent = state.file.name; $('[data-file-meta]').textContent = `${bytes(state.file.size)} · ${count} ${count === 1 ? 'page' : 'pages'}`; $('[data-result]').hidden = false; $('[data-status]').textContent = `PDF loaded successfully. ${count} ${count === 1 ? 'page' : 'pages'} found.`; }
    catch (error) { if (state.pdf && state.pdf.destroy) await state.pdf.destroy().catch(() => {}); state.pdf = null; const message = error && error.name === 'PasswordException' ? 'This PDF is password-protected and cannot be counted here.' : error.message === 'page-limit' ? 'This PDF contains more than the 50-page limit.' : 'Unable to read this PDF. The file may be corrupted or unsupported.'; resetTool(); showError(message); }
    finally { state.busy = false; $('[data-processing]').hidden = true; }
  }
  function resetTool() { state.token += 1; if (state.pdf && state.pdf.destroy) Promise.resolve(state.pdf.destroy()).catch(() => {}); state.pdf = null; state.buffer = null; state.file = null; input.value = ''; zone.hidden = false; $('[data-file-summary]').hidden = true; $('[data-result]').hidden = true; $('[data-page-count]').textContent = '0'; $('[data-page-label]').textContent = 'Pages'; $('[data-file-name]').textContent = ''; $('[data-file-meta]').textContent = ''; $('[data-status]').textContent = 'Choose a PDF to begin.'; clearError(); }
})();

