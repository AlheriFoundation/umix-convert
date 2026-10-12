(() => {
  'use strict';

  const input = document.querySelector('[data-text-input]');
  const copyButton = document.querySelector('[data-copy]');
  const clearButton = document.querySelector('[data-clear]');
  if (!input || !copyButton || !clearButton) return;

  const stat = name => document.querySelector(`[data-stat="${name}"]`);
  const status = document.querySelector('[data-status]');

  function getWords(text) {
    if (!text.trim()) return 0;
    if ('Segmenter' in Intl) {
      const segments = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)];
      return segments.filter(part => part.isWordLike).length;
    }
    return (text.match(/[\p{L}\p{M}\p{N}]+(?:[â€™'_-][\p{L}\p{M}\p{N}]+)*/gu) || []).length;
  }

  function getSentences(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const endings = trimmed.match(/[.!?â€¦ã€‚ï¼ï¼Ÿ]+(?=\s|$)/gu);
    return endings ? endings.length : 1;
  }

  function getParagraphs(text) {
    return text.trim() ? text.trim().split(/(?:\r?\n|\r)\s*(?:\r?\n|\r)+/u).filter(Boolean).length : 0;
  }

  function formatReadingTime(words) {
    if (!words) return 'Less than 1 min';
    return `${Math.max(1, Math.ceil(words / 200))} min`;
  }

  function update() {
    const text = input.value;
    const words = getWords(text);
    const sentences = getSentences(text);
    const characters = Array.from(text).length;
    const noSpaces = Array.from(text.replace(/\s/gu, '')).length;
    const paragraphs = getParagraphs(text);
    const lines = text ? text.split(/\r\n|\r|\n/u).length : 0;
    stat('words').textContent = words.toLocaleString();
    stat('characters').textContent = characters.toLocaleString();
    stat('charactersNoSpaces').textContent = noSpaces.toLocaleString();
    stat('sentences').textContent = sentences.toLocaleString();
    stat('paragraphs').textContent = paragraphs.toLocaleString();
    stat('readingTime').textContent = formatReadingTime(words);
    stat('lines').textContent = lines.toLocaleString();
    stat('average').textContent = sentences ? (words / sentences).toFixed(1) : '0';
    status.textContent = text ? `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} counted.` : 'Start typing to see your statistics.';
  }

  async function copyText() {
    const text = input.value;
    if (!text) { status.textContent = 'There is no text to copy.'; return; }
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        input.focus();
        input.select();
        if (!document.execCommand('copy')) throw new Error('copy-failed');
        input.setSelectionRange(input.value.length, input.value.length);
      }
      const original = copyButton.textContent;
      copyButton.textContent = 'Copied!';
      status.textContent = 'Text copied to your clipboard.';
      window.setTimeout(() => { copyButton.textContent = original; }, 1600);
    } catch (error) {
      status.textContent = 'Copying was not available. Select the text and copy it manually.';
    }
  }

  input.addEventListener('input', update);
  clearButton.addEventListener('click', () => { input.value = ''; update(); input.focus(); });
  copyButton.addEventListener('click', copyText);
  update();
})();

