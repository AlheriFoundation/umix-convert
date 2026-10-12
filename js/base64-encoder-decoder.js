(() => {
  'use strict';
  const input = document.querySelector('[data-base64-input]');
  const output = document.querySelector('[data-base64-output]');
  const fileInput = document.querySelector('[data-base64-file]');
  const errorBox = document.querySelector('[data-base64-error]');
  const status = document.querySelector('[data-base64-status]');
  const inputCount = document.querySelector('[data-base64-input-count]');
  const outputCount = document.querySelector('[data-base64-output-count]');
  if (!input || !output || !fileInput) return;
  const MAX_INPUT_BYTES = 5 * 1024 * 1024;
  let outputUrl = null;
  let fileToken = 0;
  const sample = 'Hausa: Sannu duniya! ðŸŒ\nUMiX Convert â€” Convert. Compress. Simplify.';
  function setError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
  function clearUrl() { if (outputUrl) URL.revokeObjectURL(outputUrl); outputUrl = null; }
  function updateCounts() { inputCount.textContent = `${input.value.length.toLocaleString()} characters`; outputCount.textContent = `${output.value.length.toLocaleString()} characters`; }
  function clearStatus() { setError(''); status.textContent = ''; }
  function ensureInput() { if (!input.value) throw new Error('empty'); const bytes = new TextEncoder().encode(input.value); if (bytes.byteLength > MAX_INPUT_BYTES) throw new Error('large'); return bytes; }
  function encodeBytes(bytes) { let binary = ''; const chunk = 0x8000; for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk)); return btoa(binary); }
  function decodeBase64(value) { const cleaned = value.replace(/[\t\n\r ]/g, ''); if (!cleaned) throw new Error('empty'); if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(cleaned)) throw new Error('base64'); const binary = atob(cleaned); const bytes = Uint8Array.from(binary, character => character.charCodeAt(0)); if (bytes.byteLength > MAX_INPUT_BYTES) throw new Error('large'); try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (error) { throw new Error('utf8'); } }
  function encode() { try { output.value = encodeBytes(ensureInput()); updateCounts(); clearStatus(); status.textContent = 'Text encoded as UTF-8 Base64 successfully.'; } catch (error) { output.value = ''; updateCounts(); setError(error.message === 'empty' ? 'Enter text before encoding.' : error.message === 'large' ? 'Input is larger than the 5 MB limit.' : 'This browser cannot encode the input as UTF-8 Base64.'); } }
  function decode() { try { output.value = decodeBase64(input.value); updateCounts(); clearStatus(); status.textContent = 'Base64 decoded as UTF-8 text successfully.'; } catch (error) { output.value = ''; updateCounts(); setError(error.message === 'empty' ? 'Enter Base64 before decoding.' : error.message === 'base64' ? 'Invalid Base64. Use standard Base64 characters and correct padding.' : error.message === 'utf8' ? 'The Base64 bytes are not valid UTF-8 text.' : error.message === 'large' ? 'Decoded content is larger than the 5 MB limit.' : 'The Base64 text could not be decoded.'); } }
  async function copy() { if (!output.value) { status.textContent = 'There is no output to copy. Encode or decode something first.'; return; } try { if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(output.value); else { output.focus(); output.select(); if (!document.execCommand('copy')) throw new Error('copy'); output.setSelectionRange(output.value.length, output.value.length); } status.textContent = 'Output copied to your clipboard.'; } catch (error) { status.textContent = 'Copying was not available. Select the output and copy it manually.'; } }
  function download() { if (!output.value) { status.textContent = 'There is no output to download.'; return; } try { clearUrl(); const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' }); if (!blob.size) throw new Error('empty'); outputUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = outputUrl; link.download = 'base64-output.txt'; document.body.append(link); link.click(); link.remove(); status.textContent = 'Text download prepared.'; } catch (error) { status.textContent = 'The text download could not be prepared.'; } }
  document.querySelector('[data-base64-encode]').addEventListener('click', encode);
  document.querySelector('[data-base64-decode]').addEventListener('click', decode);
  document.querySelector('[data-base64-copy]').addEventListener('click', copy);
  document.querySelector('[data-base64-download]').addEventListener('click', download);
  document.querySelector('[data-base64-clear]').addEventListener('click', () => { fileToken += 1; input.value = ''; output.value = ''; fileInput.value = ''; clearUrl(); clearStatus(); status.textContent = 'Input and output cleared.'; updateCounts(); input.focus(); });
  document.querySelector('[data-base64-sample]').addEventListener('click', () => { input.value = sample; output.value = ''; clearUrl(); clearStatus(); status.textContent = 'Sample text loaded. Choose Encode to Base64 to continue.'; updateCounts(); input.focus(); });
  input.addEventListener('input', () => { clearStatus(); clearUrl(); output.value = ''; updateCounts(); });
  fileInput.addEventListener('change', async () => { const file = fileInput.files[0]; if (!file) return; if (!/\.txt$/i.test(file.name) && file.type !== 'text/plain') { setError('Please choose a plain-text .txt file.'); return; } if (!file.size) { setError('The selected text file is empty.'); return; } const token = ++fileToken; try { const text = await file.text(); if (token !== fileToken) return; if (new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES) throw new Error('large'); input.value = text.replace(/^\uFEFF/, ''); output.value = ''; clearUrl(); clearStatus(); status.textContent = `${file.name} loaded. Choose Encode or Decode.`; updateCounts(); } catch (error) { if (token === fileToken) setError(error.message === 'large' ? 'This text file is larger than the 5 MB limit.' : 'The text file could not be read.'); } });
  window.addEventListener('beforeunload', clearUrl);
  updateCounts();
})();

