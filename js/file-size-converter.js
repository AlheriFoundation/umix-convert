(() => {
  'use strict';

  const valueInput = document.querySelector('[data-value]');
  const fromSelect = document.querySelector('[data-from]');
  const toSelect = document.querySelector('[data-to]');
  const resultValue = document.querySelector('[data-result-value]');
  const resultDetail = document.querySelector('[data-result-detail]');
  const errorBox = document.querySelector('[data-error]');
  const swapButton = document.querySelector('[data-swap]');
  const clearButton = document.querySelector('[data-clear]');
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const factors = [1, 1024, 1024 ** 2, 1024 ** 3, 1024 ** 4, 1024 ** 5];
  const maxExactBytes = Number.MAX_SAFE_INTEGER;

  if (!valueInput || !fromSelect || !toSelect || !resultValue || !resultDetail || !errorBox || !swapButton || !clearButton) return;

  function formatNumber(value) {
    const rounded = Number(value.toPrecision(12));
    return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 12, useGrouping: true }).format(rounded);
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function resetResult() {
    resultValue.textContent = 'Enter a value to convert.';
    resultDetail.textContent = 'Conversions use the binary standard: 1 KB = 1,024 Bytes.';
  }

  function update() {
    const raw = valueInput.value.trim();
    showError('');
    if (!raw) { resetResult(); return; }

    const value = Number(raw);
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      showError('Enter a valid file size.');
      resetResult();
      return;
    }
    if (value < 0) {
      showError('File size cannot be negative.');
      resetResult();
      return;
    }

    const from = Number(fromSelect.value);
    const to = Number(toSelect.value);
    const bytes = value * factors[from];
    if (!Number.isFinite(bytes) || bytes > maxExactBytes) {
      showError('This value is too large for reliable conversion.');
      resetResult();
      return;
    }

    const converted = bytes / factors[to];
    resultValue.textContent = `${formatNumber(value)} ${units[from]} = ${formatNumber(converted)} ${units[to]}`;
    resultDetail.textContent = 'Binary standard: 1 KB = 1,024 Bytes; each larger unit is 1,024 of the previous unit.';
  }

  valueInput.addEventListener('input', update);
  fromSelect.addEventListener('change', update);
  toSelect.addEventListener('change', update);
  swapButton.addEventListener('click', () => {
    const from = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = from;
    update();
  });
  clearButton.addEventListener('click', () => {
    valueInput.value = '';
    showError('');
    resetResult();
    valueInput.focus();
  });

  update();
})();

