// MathJax settings shared by both pages. Loaded before MathJax itself.
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true, // \$ shows a literal dollar sign
    processEnvironments: true, // align*, equation, ... outside $...$
  },
  options: {
    enableMenu: false,
  },
  startup: {
    typeset: false, // the app typesets content as it is shown
  },
};
