(() => {
  'use strict';

  const selector = document.querySelector('[data-conversion-selector]');
  if (!selector) return;

  const from = selector.querySelector('[name="from"]');
  const to = selector.querySelector('[name="to"]');
  const status = selector.querySelector('[data-conversion-status]');
  const submit = selector.querySelector('[data-conversion-submit]');
  const targetLabels = {
    pdf: 'PDF',
    jpg: 'JPG',
    png: 'PNG',
    docx: 'Word (.docx)',
    xlsx: 'Excel (.xlsx)',
    csv: 'CSV',
    txt: 'TXT'
  };
  const conversions = {
    pdf: {
      docx: { page: 'tools/pdf-to-word.html', output: 'Word' },
      xlsx: { page: 'tools/pdf-to-excel.html', output: 'Excel' },
      jpg: { page: 'tools/pdf-to-jpg.html', output: 'JPG' },
      png: { page: 'tools/pdf-to-png.html', output: 'PNG' },
      txt: { page: 'tools/pdf-to-text.html', output: 'TXT' }
    },
    jpg: {
      pdf: { page: 'tools/jpg-to-pdf.html', output: 'PDF' },
      png: { page: 'tools/jpg-to-png.html', output: 'PNG' }
    },
    png: {
      pdf: { page: 'tools/image-to-pdf.html', output: 'PDF' },
      jpg: { page: 'tools/png-to-jpg.html', output: 'JPG' }
    },
    webp: {
      pdf: { page: 'tools/image-to-pdf.html', output: 'PDF' }
    },
    excel: {
      pdf: { page: 'tools/excel-to-pdf.html', output: 'PDF' },
      csv: { page: 'tools/excel-to-csv.html', output: 'CSV' }
    },
    csv: {
      xlsx: { page: 'tools/csv-to-excel.html', output: 'Excel' }
    },
    txt: {
      pdf: { page: 'tools/txt-to-pdf.html', output: 'PDF' },
      xlsx: { page: 'tools/csv-to-excel.html', output: 'Excel', note: 'TXT files must contain CSV-formatted data.' }
    },
    pptx: {
      pdf: { page: 'tools/powerpoint-to-pdf.html', output: 'PDF' },
      jpg: { page: 'tools/powerpoint-to-images.html', output: 'JPG', note: 'Choose JPG as the image format after selecting your presentation.' },
      png: { page: 'tools/powerpoint-to-images.html', output: 'PNG', note: 'Choose PNG as the image format after selecting your presentation.' }
    },
    docx: {
      pdf: { page: 'tools/word-to-pdf.html', output: 'PDF' }
    }
  };

  function selectedConversion() {
    return conversions[from.value]?.[to.value] || null;
  }

  function updateTargetOptions() {
    const availableTargets = Object.keys(conversions[from.value] || {});
    to.replaceChildren(new Option(
      from.value ? 'Choose an output format' : 'Choose a file format first',
      '',
      true,
      true
    ));
    to.disabled = !from.value;
    availableTargets.forEach(value => to.add(new Option(targetLabels[value], value)));
  }

  function updateAvailability() {
    const source = from.options[from.selectedIndex]?.textContent || '';
    const target = to.options[to.selectedIndex]?.textContent || '';
    const conversion = selectedConversion();

    submit.disabled = !conversion;
    status.removeAttribute('data-state');

    if (!from.value) {
      status.textContent = 'Choose a source format to see the available conversions.';
    } else if (!to.value) {
      status.textContent = 'Choose an output format. Only supported formats are listed.';
    } else if (conversion) {
      const extra = conversion.note ? ` ${conversion.note}` : ' You can choose your file on the next page.';
      status.textContent = `${source} to ${target} is supported.${extra}`;
      status.dataset.state = 'supported';
    } else {
      status.textContent = `${source} to ${target} is not supported yet. Choose another format pair to continue.`;
      status.dataset.state = 'unsupported';
    }
  }

  from.addEventListener('change', () => {
    updateTargetOptions();
    updateAvailability();
  });
  to.addEventListener('change', updateAvailability);
  selector.addEventListener('submit', event => {
    event.preventDefault();
    const conversion = selectedConversion();
    if (conversion) window.location.assign(conversion.page);
  });

  // Quick Dropzone auto-detection
  const dropzone = document.querySelector('[data-quick-dropzone]');
  const quickBrowse = document.querySelector('[data-quick-browse]');
  const quickInput = document.createElement('input');
  quickInput.type = 'file';
  quickInput.style.display = 'none';
  quickInput.setAttribute('aria-hidden', 'true');
  document.body.appendChild(quickInput);

  function detectFormat(file) {
    if (!file) return null;
    const name = file.name.toLowerCase();
    if (/\.pdf$/i.test(name)) return 'pdf';
    if (/\.jpe?g$/i.test(name)) return 'jpg';
    if (/\.png$/i.test(name)) return 'png';
    if (/\.webp$/i.test(name)) return 'webp';
    if (/\.xlsx?$/i.test(name)) return 'excel';
    if (/\.csv$/i.test(name)) return 'csv';
    if (/\.docx$/i.test(name)) return 'docx';
    if (/\.pptx$/i.test(name)) return 'pptx';
    if (/\.txt$/i.test(name)) return 'txt';
    return null;
  }

  function handleQuickFile(file) {
    if (!file) return;
    const fmt = detectFormat(file);
    if (fmt) {
      from.value = fmt;
      updateTargetOptions();
      updateAvailability();
      if (dropzone) {
        dropzone.classList.add('has-file');
        const p = dropzone.querySelector('p');
        if (p) p.innerHTML = `<strong>Selected file:</strong> ${file.name} (${fmt.toUpperCase()})`;
      }
      status.textContent = `Detected ${file.name}. Choose an output format and click Start Converting.`;
      status.dataset.state = 'supported';
    } else {
      status.textContent = `Unrecognized format for ${file.name}. Please select formats from the list.`;
      status.dataset.state = 'unsupported';
    }
  }

  if (quickBrowse) {
    quickBrowse.addEventListener('click', (e) => {
      e.preventDefault();
      quickInput.click();
    });
  }

  quickInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleQuickFile(e.target.files[0]);
    }
  });

  if (dropzone) {
    let dragCounter = 0;
    dropzone.addEventListener('click', (e) => {
      if (e.target !== quickBrowse && !e.target.closest('button')) {
        quickInput.click();
      }
    });
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      dropzone.classList.add('is-dragging');
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragging');
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        dropzone.classList.remove('is-dragging');
      }
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropzone.classList.remove('is-dragging');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleQuickFile(e.dataTransfer.files[0]);
      }
    });
  }

  updateTargetOptions();
  updateAvailability();
})();
