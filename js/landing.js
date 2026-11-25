// The landing page: typeset the sample clue, and download the template.

import { downloadGameFromButton } from './files.js';

document.getElementById('download-template').addEventListener('click', (e) => {
  downloadGameFromButton('template/template.tex', e.currentTarget);
});

// MathJax is told not to typeset the whole page (the code sample has $...$
// in it), so typeset just the sample clue once MathJax is ready.
function typesetSample() {
  const M = window.MathJax;
  if (!M || !M.startup || !M.startup.promise) return setTimeout(typesetSample, 100);
  M.startup.promise.then(() => M.typesetPromise(document.querySelectorAll('.mock-clue-text'))).catch(() => {});
}
typesetSample();
