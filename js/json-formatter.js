(() => {
  'use strict';
  const input = document.querySelector('[data-json-input]');
  const output = document.querySelector('[data-json-output]');
  const fileInput = document.querySelector('[data-json-file]');
  const status = document.querySelector('[data-json-status]');
  const errorBox = document.querySelector('[data-json-error]');
  const indent = document.querySelector('[data-indent]');
  const inputCount = document.querySelector('[data-input-count]');
  const outputCount = document.querySelector('[data-output-count]');
  if (!input || !output || !fileInput) return;
  let outputUrl = null;
  let loadToken = 0;
  const sample = { name: 'UMiX Converter', tagline: 'Convert. Compress. Simplify.', features: ['Format JSON', 'Validate JSON', 'Minify JSON'], local: true };
  function setError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
  function updateCounts() { inputCount.textContent = `${input.value.length.toLocaleString()} characters`; outputCount.textContent = `${output.value.length.toLocaleString()} characters`; }
  function clearUrl() { if (outputUrl) URL.revokeObjectURL(outputUrl); outputUrl = null; }
  function clearStatus() { setError(''); status.textContent = ''; }
  function describeError(error) { const match = /position (\d+)/i.exec(error.message || ''); if (!match) return 'Invalid JSON. Check commas, quotes, brackets, and values.'; const position = Number(match[1]); const before = input.value.slice(0, position); const line = before.split(/\r\n|\r|\n/).length; const column = position - before.lastIndexOf('\n'); return `Invalid JSON near line ${line}, column ${column} (character ${position}). Check commas, quotes, brackets, and values.`; }
  function parse() { if (!input.value.trim()) throw new Error('empty'); return JSON.parse(input.value); }
  function write(value, spaces) { return JSON.stringify(value, null, spaces); }
  function updateInput() { clearStatus(); clearUrl(); output.value = ''; updateCounts(); }
  function formatJson() { try { const value = parse(); output.value = write(value, Number(indent.value)); updateCounts(); status.textContent = `Valid JSON formatted with ${indent.value}-space indentation.`; setError(''); } catch (error) { output.value = ''; updateCounts(); setError(error.message === 'empty' ? 'Enter JSON before formatting.' : describeError(error)); status.textContent = ''; } }
  function minifyJson() { try { const value = parse(); output.value = write(value, 0); updateCounts(); status.textContent = 'Valid JSON minified successfully.'; setError(''); } catch (error) { output.value = ''; updateCounts(); setError(error.message === 'empty' ? 'Enter JSON before minifying.' : describeError(error)); status.textContent = ''; } }
  function validateJson() { try { parse(); setError(''); status.textContent = 'Valid JSON. The syntax and data types were parsed successfully.'; } catch (error) { setError(error.message === 'empty' ? 'Enter JSON to validate.' : describeError(error)); status.textContent = ''; } }
  async function copyOutput() { if (!output.value) { status.textContent = 'There is no output to copy. Format or minify valid JSON first.'; return; } try { if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(output.value); else { output.focus(); output.select(); if (!document.execCommand('copy')) throw new Error('copy'); output.setSelectionRange(output.value.length, output.value.length); } status.textContent = 'Output copied to your clipboard.'; } catch (error) { status.textContent = 'Copying was not available. Select the output and copy it manually.'; } }
  function downloadJson() { if (!output.value) { status.textContent = 'There is no output to download. Format or minify valid JSON first.'; return; } try { clearUrl(); const blob = new Blob([output.value], { type: 'application/json;charset=utf-8' }); if (!blob.size) throw new Error('empty'); outputUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = outputUrl; link.download = 'formatted.json'; document.body.append(link); link.click(); link.remove(); status.textContent = 'JSON download prepared.'; } catch (error) { status.textContent = 'The JSON download could not be prepared.'; } }
  document.querySelector('[data-format]').addEventListener('click', formatJson);
  document.querySelector('[data-minify]').addEventListener('click', minifyJson);
  document.querySelector('[data-validate]').addEventListener('click', validateJson);
  document.querySelector('[data-copy]').addEventListener('click', copyOutput);
  document.querySelector('[data-download]').addEventListener('click', downloadJson);
  document.querySelector('[data-clear]').addEventListener('click', () => { loadToken += 1; input.value = ''; output.value = ''; fileInput.value = ''; clearUrl(); clearStatus(); status.textContent = 'Input cleared.'; updateCounts(); input.focus(); });
  document.querySelector('[data-sample]').addEventListener('click', () => { input.value = write(sample, 2); output.value = ''; clearUrl(); clearStatus(); status.textContent = 'Sample JSON loaded. You can edit it or format it.'; updateCounts(); input.focus(); });
  input.addEventListener('input', updateInput);
  fileInput.addEventListener('change', async () => { const file = fileInput.files[0]; if (!file) return; if (!/\.json$/i.test(file.name) && file.type !== 'application/json') { setError('Please choose a JSON file.'); return; } if (!file.size) { setError('The selected JSON file is empty.'); return; } const token = ++loadToken; try { const text = await file.text(); if (token !== loadToken) return; input.value = text.replace(/^\uFEFF/, ''); output.value = ''; clearUrl(); clearStatus(); status.textContent = `${file.name} loaded. Validate or format it to inspect the JSON.`; updateCounts(); } catch (error) { if (token === loadToken) setError('The JSON file could not be read.'); } });
  window.addEventListener('beforeunload', clearUrl);
  updateCounts();
})();

