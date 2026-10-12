(() => {
  'use strict';

  const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
  const MAX_FILES = 50;
  const state = { items: [], results: [], zipUrl: null, busy: false, selectionToken: 0 };

  const $ = selector => document.querySelector(selector);
  const uploadZone = $('[data-upload-zone]');
  const fileInput = $('[data-file-input]');
  const errorBox = $('[data-tool-error]');
  const inputPanel = $('[data-input-panel]');
  const imageList = $('[data-image-list]');
  const processing = $('[data-processing-panel]');
  const actions = $('[data-converter-actions]');
  const resultsPanel = $('[data-results-panel]');
  const resultsGrid = $('[data-results-grid]');

  if (!uploadZone || !fileInput || !window.JSZip) {
    showError('This tool could not load its ZIP packaging library. Please refresh the page and try again.');
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
  $('[data-convert]').addEventListener('click', processFiles);
  $('[data-download-all]').addEventListener('click', downloadAll);
  $('[data-reset]').addEventListener('click', () => { if (!state.busy) resetTool(); });

  function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
  function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
  function baseName(name) { return name.replace(/\.(jpe?g)$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'converted-image'; }
  function totalBytes(items = state.items) { return items.reduce((total, item) => total + item.file.size, 0); }

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
      if (token !== state.selectionToken) { cleanupItems(newItems); return; }
      state.items.push(...newItems);
      invalidateResults();
      renderInputList();
    } catch (error) {
      cleanupItems(newItems);
      showError('One or more images could not be decoded. Please choose valid JPG files.');
    } finally {
      state.busy = false;
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const previewUrl = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve({ file, previewUrl, image, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => { image.src = ''; URL.revokeObjectURL(previewUrl); reject(new Error('Image decode failed')); };
      image.src = previewUrl;
    });
  }

  function renderInputList() {
    inputPanel.hidden = state.items.length === 0;
    uploadZone.hidden = state.items.length > 0;
    $('[data-file-count]').textContent = state.items.length;
    actions.hidden = state.items.length === 0 || state.results.length > 0;
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
      meta.textContent = `${formatBytes(item.file.size)} Â· ${item.width} Ã— ${item.height}px`;
      details.append(name, meta);
      const position = document.createElement('span');
      position.className = 'image-position';
      position.textContent = `${index + 1}`;
      position.setAttribute('aria-label', `Image ${index + 1} of ${state.items.length}`);
      row.append(image, details, position);
      fragment.append(row);
    });
    imageList.replaceChildren(fragment);
  }

  function convertImageToPng(item) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = item.width;
      canvas.height = item.height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) { reject(new Error('Canvas unavailable')); return; }
      context.drawImage(item.image, 0, 0, item.width, item.height);
      canvas.toBlob(blob => {
        canvas.width = 1;
        canvas.height = 1;
        if (blob && blob.type === 'image/png') resolve(blob);
        else reject(new Error('PNG creation failed'));
      }, 'image/png');
    });
  }

  async function processFiles() {
    if (!state.items.length || state.busy) return;
    clearError();
    state.busy = true;
    actions.hidden = true;
    resultsPanel.hidden = true;
    processing.hidden = false;
    revokeResults();
    state.results = [];
    const progress = $('[data-progress-bar]');
    const label = $('[data-processing-label]');
    const count = $('[data-processing-count]');
    const total = state.items.length;
    const usedNames = new Set();
    try {
      for (let index = 0; index < total; index += 1) {
        label.textContent = `Converting image ${index + 1} of ${total}...`;
        count.textContent = `${index} of ${total} complete`;
        progress.style.width = `${(index / total) * 100}%`;
        const item = state.items[index];
        const blob = await convertImageToPng(item);
        const stem = baseName(item.file.name);
        let name = `${stem}.png`;
        let duplicate = 2;
        while (usedNames.has(name)) name = `${stem}-${duplicate++}.png`;
        usedNames.add(name);
        state.results.push({ blob, url: URL.createObjectURL(blob), name, width: item.width, height: item.height });
      }
      progress.style.width = '100%';
      label.textContent = `${total} ${total === 1 ? 'image' : 'images'} converted successfully.`;
      count.textContent = '';
      renderResults();
      resultsPanel.hidden = false;
    } catch (error) {
      revokeResults();
      state.results = [];
      showError('One or more images could not be converted to PNG. Please try again with valid JPG files.');
      actions.hidden = false;
    } finally {
      state.busy = false;
      processing.hidden = true;
    }
  }

  function renderResults() {
    const fragment = document.createDocumentFragment();
    state.results.forEach(result => {
      const card = document.createElement('article');
      card.className = 'png-result-card';
      const image = document.createElement('img');
      image.src = result.url;
      image.alt = `PNG preview of ${result.name}`;
      image.loading = 'lazy';
      const title = document.createElement('h3');
      title.textContent = result.name;
      const meta = document.createElement('p');
      meta.textContent = `${result.width} Ã— ${result.height}px Â· ${formatBytes(result.blob.size)}`;
      const download = document.createElement('a');
      download.className = 'button button-secondary';
      download.href = result.url;
      download.download = result.name;
      download.textContent = 'Download PNG';
      download.setAttribute('aria-label', `Download ${result.name}`);
      card.append(image, title, meta, download);
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
      const zip = new JSZip();
      state.results.forEach(result => zip.file(result.name, result.blob));
      revokeZipUrl();
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      state.zipUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = state.zipUrl;
      link.download = 'converted-png-images.zip';
      link.click();
      const zipUrl = state.zipUrl;
      setTimeout(() => { if (state.zipUrl === zipUrl) revokeZipUrl(); }, 1000);
    } catch (error) {
      showError('The PNG files could not be packaged. Please download them individually.');
    } finally {
      state.busy = false;
      button.disabled = false;
      button.textContent = 'Download All PNGs';
    }
  }

  function cleanupItems(items) { items.forEach(item => { item.image.src = ''; URL.revokeObjectURL(item.previewUrl); }); }
  function revokeResults() { state.results.forEach(result => URL.revokeObjectURL(result.url)); }
  function revokeZipUrl() { if (state.zipUrl) URL.revokeObjectURL(state.zipUrl); state.zipUrl = null; }
  function invalidateResults() { revokeResults(); state.results = []; revokeZipUrl(); resultsPanel.hidden = true; }

  function resetTool() {
    if (state.busy) return;
    state.selectionToken += 1;
    cleanupItems(state.items);
    revokeResults();
    revokeZipUrl();
    state.items = [];
    state.results = [];
    fileInput.value = '';
    inputPanel.hidden = true;
    uploadZone.hidden = false;
    actions.hidden = true;
    processing.hidden = true;
    resultsPanel.hidden = true;
    imageList.replaceChildren();
    resultsGrid.replaceChildren();
    $('[data-file-count]').textContent = '0';
    $('[data-progress-bar]').style.width = '0%';
    clearError();
  }
})();

