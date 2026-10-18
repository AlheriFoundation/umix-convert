(() => {
  'use strict';

  const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
  const MAX_FILES = 50;
  const MAX_PAGE_PT = 842;
  const state = { items: [], pdfUrl: null, pdfBlob: null, busy: false, selectionToken: 0 };

  const $ = selector => document.querySelector(selector);
  const uploadZone = $('[data-upload-zone]');
  const fileInput = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const listPanel = $('[data-image-list-panel]');
  const imageList = $('[data-image-list]');
  const processing = $('[data-processing-panel]');
  const actions = $('[data-converter-actions]');
  const resultPanel = $('[data-pdf-result]');

  if (!uploadZone || !fileInput || !window.jspdf || !window.jspdf.jsPDF) {
    showError('This tool could not load its PDF creation library. Please refresh the page and try again.');
    return;
  }

  $('[data-browse]').addEventListener('click', event => { event.stopPropagation(); fileInput.click(); });
  $('[data-add-more]').addEventListener('click', () => { if (!state.busy) fileInput.click(); });
  uploadZone.addEventListener('click', () => { if (!state.busy) fileInput.click(); });
  uploadZone.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && !state.busy) { event.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', event => addFiles([...event.target.files]));
  uploadZone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) uploadZone.classList.add('is-dragging'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragging'));
  uploadZone.addEventListener('drop', event => {
    event.preventDefault();
    uploadZone.classList.remove('is-dragging');
    if (!state.busy) addFiles([...event.dataTransfer.files]);
  });
  $('[data-convert]').addEventListener('click', generatePdf);
  $('[data-download-pdf]').addEventListener('click', downloadPdf);
  $('[data-reset]').addEventListener('click', () => { if (!state.busy) resetTool(); });

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
  function totalBytes(items = state.items) { return items.reduce((total, item) => total + item.file.size, 0); }
  function baseName(name) { return name.replace(/\.(jpe?g)$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'images'; }

  function validateFiles(files) {
    if (!files.length) return 'Please select at least one JPG image.';
    if (state.items.length + files.length > MAX_FILES) return `You can select up to ${MAX_FILES} JPG images.`;
    for (const file of files) {
      const extensionIsJpg = /\.(jpe?g)$/i.test(file.name);
      const mimeIsJpg = file.type === 'image/jpeg';
      if (!extensionIsJpg || (file.type && !mimeIsJpg)) return 'Please select JPG or JPEG images only. PNG, WebP, GIF and PDF files are not supported.';
      if (!file.size) return 'One or more selected files are empty or invalid.';
    }
    if (totalBytes() + files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) return 'The selected images exceed the 25 MB total size limit.';
    return '';
  }

  async function addFiles(files) {
    if (state.busy) return;
    clearError();
    const validationError = validateFiles(files);
    fileInput.value = '';
    if (validationError) { showError(validationError); return; }
    state.busy = true;
    const token = ++state.selectionToken;
    const newItems = [];
    try {
      for (const file of files) newItems.push(await loadImage(file));
      if (token !== state.selectionToken) { newItems.forEach(item => URL.revokeObjectURL(item.previewUrl)); return; }
      state.items.push(...newItems);
      invalidatePdf();
      renderFileList();
    } catch (error) {
      newItems.forEach(item => URL.revokeObjectURL(item.previewUrl));
      showError('One or more images could not be decoded. Please choose valid JPG files.');
    } finally {
      state.busy = false;
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const previewUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ file, previewUrl, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => { URL.revokeObjectURL(previewUrl); reject(new Error('Image decode failed')); };
      image.src = previewUrl;
    });
  }

  function renderFileList() {
    listPanel.hidden = state.items.length === 0;
    uploadZone.hidden = state.items.length > 0;
    $('[data-file-count]').textContent = state.items.length;
    actions.hidden = state.items.length === 0 || Boolean(state.pdfUrl);
    const fragment = document.createDocumentFragment();
    state.items.forEach((item, index) => {
      const row = document.createElement('article');
      row.className = 'image-file-row';
      const image = document.createElement('img');
      image.src = item.previewUrl;
      image.alt = `Preview of ${item.file.name}`;
      image.width = 88;
      image.height = 66;
      const details = document.createElement('div');
      details.className = 'image-file-details';
      const name = document.createElement('strong');
      name.textContent = item.file.name;
      const meta = document.createElement('span');
      meta.textContent = `${formatBytes(item.file.size)} · ${item.width} × ${item.height}px`;
      details.append(name, meta);
      const controls = document.createElement('div');
      controls.className = 'image-file-controls';
      const position = document.createElement('span');
      position.className = 'image-position';
      position.textContent = `${index + 1}`;
      position.setAttribute('aria-label', `Image ${index + 1} of ${state.items.length}`);
      const up = createControl('Move Up', () => moveFile(index, -1), index === 0 || state.busy);
      const down = createControl('Move Down', () => moveFile(index, 1), index === state.items.length - 1 || state.busy);
      const remove = createControl('Remove', () => removeFile(index), state.busy);
      controls.append(position, up, down, remove);
      row.append(image, details, controls);
      fragment.append(row);
    });
    imageList.replaceChildren(fragment);
  }

  function createControl(label, handler, disabled) {
    const button = document.createElement('button');
    button.className = 'button button-secondary button-small';
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', handler);
    return button;
  }

  function moveFile(index, direction) {
    if (state.busy) return;
    const target = index + direction;
    if (target < 0 || target >= state.items.length) return;
    [state.items[index], state.items[target]] = [state.items[target], state.items[index]];
    invalidatePdf();
    renderFileList();
  }

  function removeFile(index) {
    if (state.busy) return;
    const [removed] = state.items.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    invalidatePdf();
    renderFileList();
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Image read failed'));
      reader.readAsDataURL(file);
    });
  }

  function pageSize(width, height) {
    const scale = Math.min(1, MAX_PAGE_PT / width, MAX_PAGE_PT / height);
    return { width: width * scale, height: height * scale };
  }

  async function generatePdf() {
    if (!state.items.length || state.busy) return;
    clearError();
    state.busy = true;
    actions.hidden = true;
    resultPanel.hidden = true;
    processing.hidden = false;
    const progress = $('[data-progress-bar]');
    const label = $('[data-processing-label]');
    const count = $('[data-processing-count]');
    const total = state.items.length;
    try {
      let pdf = null;
      for (let index = 0; index < total; index += 1) {
        label.textContent = `Adding image ${index + 1} of ${total}...`;
        count.textContent = `${index} of ${total} complete`;
        progress.style.width = `${(index / total) * 100}%`;
        const item = state.items[index];
        const dataUrl = await readAsDataUrl(item.file);
        const size = pageSize(item.width, item.height);
        if (!pdf) pdf = new window.jspdf.jsPDF({ unit: 'pt', format: [size.width, size.height], compress: true });
        else pdf.addPage([size.width, size.height]);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, size.width, size.height, undefined, 'FAST');
      }
      label.textContent = 'Finalizing PDF...';
      progress.style.width = '100%';
      const blob = pdf.output('blob');
      revokePdfUrl();
      state.pdfBlob = blob;
      state.pdfUrl = URL.createObjectURL(blob);
      $('[data-result-meta]').textContent = `${total} ${total === 1 ? 'image' : 'images'} · ${formatBytes(blob.size)}`;
      resultPanel.hidden = false;
    } catch (error) {
      showError('The PDF could not be generated. Please try fewer or smaller JPG images.');
      actions.hidden = false;
    } finally {
      state.busy = false;
      processing.hidden = true;
    }
  }

  function downloadPdf() {
    if (!state.pdfUrl || state.busy) return;
    const link = document.createElement('a');
    link.href = state.pdfUrl;
    link.download = `${baseName(state.items[0].file.name)}-images.pdf`;
    link.click();
  }

  function revokePdfUrl() {
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = null;
    state.pdfBlob = null;
  }

  function invalidatePdf() {
    revokePdfUrl();
    resultPanel.hidden = true;
  }

  function resetTool() {
    if (state.busy) return;
    state.selectionToken += 1;
    state.items.forEach(item => URL.revokeObjectURL(item.previewUrl));
    revokePdfUrl();
    state.items = [];
    fileInput.value = '';
    uploadZone.hidden = false;
    listPanel.hidden = true;
    actions.hidden = true;
    resultPanel.hidden = true;
    processing.hidden = true;
    imageList.replaceChildren();
    $('[data-file-count]').textContent = '0';
    $('[data-progress-bar]').style.width = '0%';
    clearError();
  }
})();

