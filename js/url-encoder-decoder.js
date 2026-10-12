(() => {
  'use strict';
  const input = document.querySelector('[data-url-input]');
  const output = document.querySelector('[data-url-output]');
  const errorBox = document.querySelector('[data-url-error]');
  const status = document.querySelector('[data-url-status]');
  const inputCount = document.querySelector('[data-url-input-count]');
  const outputCount = document.querySelector('[data-url-output-count]');
  if (!input || !output) return;
  let outputUrl = null;
  const sample = 'https://example.com/search?q=Hausa characters & emoji ðŸŒ#results';
  function setError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
  function clearUrl() { if (outputUrl) URL.revokeObjectURL(outputUrl); outputUrl = null; }
  function updateCounts() { inputCount.textContent = `${input.value.length.toLocaleString()} characters`; outputCount.textContent = `${output.value.length.toLocaleString()} characters`; }
  function clearStatus() { setError(''); status.textContent = ''; }
  function convert(action, label) { if (!input.value) { output.value = ''; updateCounts(); setError(`Enter text before choosing ${label}.`); status.textContent = ''; return; } try { output.value = action(input.value); updateCounts(); clearStatus(); status.textContent = `${label} completed successfully.`; } catch (error) { output.value = ''; updateCounts(); clearStatus(); setError(`Could not ${label.toLowerCase()}. The input contains malformed percent-encoding or invalid URL text.`); } }
  async function copy() { if (!output.value) { status.textContent = 'There is no output to copy. Convert some text first.'; return; } try { if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(output.value); else { output.focus(); output.select(); if (!document.execCommand('copy')) throw new Error('copy'); output.setSelectionRange(output.value.length, output.value.length); } status.textContent = 'Output copied to your clipboard.'; } catch (error) { status.textContent = 'Copying was not available. Select the output and copy it manually.'; } }
  function download() { if (!output.value) { status.textContent = 'There is no output to download.'; return; } try { clearUrl(); const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' }); if (!blob.size) throw new Error('empty'); outputUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = outputUrl; link.download = 'url-output.txt'; document.body.append(link); link.click(); link.remove(); status.textContent = 'Text download prepared.'; } catch (error) { status.textContent = 'The text download could not be prepared.'; } }
  document.querySelector('[data-url-encode-component]').addEventListener('click', () => convert(encodeURIComponent, 'Component encoding'));
  document.querySelector('[data-url-decode-component]').addEventListener('click', () => convert(decodeURIComponent, 'Component decoding'));
  document.querySelector('[data-url-encode-full]').addEventListener('click', () => convert(encodeURI, 'Full URL encoding'));
  document.querySelector('[data-url-decode-full]').addEventListener('click', () => convert(decodeURI, 'Full URL decoding'));
  document.querySelector('[data-url-copy]').addEventListener('click', copy);
  document.querySelector('[data-url-download]').addEventListener('click', download);
  document.querySelector('[data-url-clear]').addEventListener('click', () => { input.value = ''; output.value = ''; clearUrl(); clearStatus(); status.textContent = 'Input and output cleared.'; updateCounts(); input.focus(); });
  document.querySelector('[data-url-sample]').addEventListener('click', () => { input.value = sample; output.value = ''; clearUrl(); clearStatus(); status.textContent = 'Sample URL loaded. Choose an encoding or decoding action.'; updateCounts(); input.focus(); });
  input.addEventListener('input', () => { clearStatus(); clearUrl(); output.value = ''; updateCounts(); });
  window.addEventListener('beforeunload', clearUrl);
  updateCounts();
})();

