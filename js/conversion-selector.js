(() => {
  'use strict';

  const selector = document.querySelector('[data-conversion-selector]');
  if (!selector) return;

  const from = selector.querySelector('[name="from"]');
  const to = selector.querySelector('[name="to"]');
  const status = selector.querySelector('[data-conversion-status]');
  const submit = selector.querySelector('[data-conversion-submit]');
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

  function updateAvailability() {
    const source = from.options[from.selectedIndex]?.textContent || '';
    const target = to.options[to.selectedIndex]?.textContent || '';
    const conversion = selectedConversion();

    submit.disabled = !conversion;
    status.removeAttribute('data-state');

    if (!from.value || !to.value) {
      status.textContent = 'Select both formats to check whether this conversion is available.';
    } else if (conversion) {
      const extra = conversion.note ? ` ${conversion.note}` : ' You can choose your file on the next page.';
      status.textContent = `${source} to ${target} is supported.${extra}`;
      status.dataset.state = 'supported';
    } else {
      status.textContent = `${source} to ${target} is not supported yet. Choose another format pair to continue.`;
      status.dataset.state = 'unsupported';
    }
  }

  from.addEventListener('change', updateAvailability);
  to.addEventListener('change', updateAvailability);
  selector.addEventListener('submit', event => {
    event.preventDefault();
    const conversion = selectedConversion();
    if (conversion) window.location.assign(conversion.page);
  });
  updateAvailability();
})();
