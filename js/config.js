// Board settings. Everything that depends on board size reads from here.

export const BOARD = {
  minCategories: 5,
  maxCategories: 6,
  cluesPerCategory: 5,
  valueStep: 100, // row 1 = 100, row 2 = 200, ...

  // When true, a game file must have between `minCategories` and
  // `maxCategories` categories with exactly `cluesPerCategory` clues each.
  // Set to false to accept boards of any size; the board layout adapts to
  // whatever the file contains.
  enforceStandardSize: true,
};

// MathJax versions of macros whose LaTeX definitions MathJax can't run
// (they rely on other packages or low-level TeX). One of these replaces a
// macro of the same name when a game or package defines it; \vv (from
// esvect) is always available.
export const MATHJAX_MACROS = {
  vv: '\\newcommand{\\vv}[1]{\\overrightarrow{#1}}',
};

export function clueValue(row) {
  return (row + 1) * BOARD.valueStep;
}
