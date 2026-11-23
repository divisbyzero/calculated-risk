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

export function clueValue(row) {
  return (row + 1) * BOARD.valueStep;
}
