/** Colour + motif vocabulary shared by every card, chip and seat. */

export const INK = '#1b1e24';
export const INK_DEEP = '#121419';
export const CREAM = '#ece7dd';
export const GOLD = '#d4a557';
/** the card stock itself — warm off-white, never pure white */
export const PAPER = '#f6f1e6';

/**
 * One hue per card value, walking the spectrum 1 → 10. `base` fills shapes,
 * `deep` is dark enough to read as text on the paper, `light` tints a half.
 */
export const VALUE_COLORS: Record<number, { base: string; deep: string; light: string }> = {
  1: { base: '#d9594b', deep: '#a8372b', light: '#f6d9d3' },
  2: { base: '#e2863a', deep: '#a8561a', light: '#f8e0cb' },
  3: { base: '#d6a72e', deep: '#8f6a0c', light: '#f5e8c4' },
  4: { base: '#94ad3f', deep: '#5b6f1c', light: '#e6edcc' },
  5: { base: '#4f9f5b', deep: '#2d6b37', light: '#d5eadb' },
  6: { base: '#2f988b', deep: '#17665c', light: '#cfe9e5' },
  7: { base: '#3b87b3', deep: '#1c5a7e', light: '#d2e5f0' },
  8: { base: '#5669ad', deep: '#34457f', light: '#dbe0f1' },
  9: { base: '#8a5dab', deep: '#5d3a7c', light: '#e6daf0' },
  10: { base: '#c1528a', deep: '#8c2f5f', light: '#f3d6e5' },
};

export function valueColor(v: number) {
  return VALUE_COLORS[v] ?? VALUE_COLORS[1];
}

/**
 * A distinct circus glyph per value, drawn inside a 100×100 box.
 * Shape carries the value as well as colour does, which keeps the table
 * readable for colour-blind players and on small screens.
 */
export const GLYPHS: Record<number, string> = {
  // top hat
  1: 'M30 62h40v7H30zM38 26h24v36H38zM34 46h32v6H34z',
  // juggling clubs (two)
  2: 'M38 24a6 6 0 0 1 12 0c0 8-3 10-3 18l2 28a5 5 0 0 1-10 0l2-28c0-8-3-10-3-18zM58 34a5 5 0 0 1 10 0c0 7-2 9-2 15l1 23a4 4 0 0 1-8 0l1-23c0-6-2-8-2-15z',
  // three-ring rings
  3: 'M30 42a13 13 0 1 1 0 26 13 13 0 0 1 0-26zm0 7a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM50 34a13 13 0 1 1 0 26 13 13 0 0 1 0-26zm0 7a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM70 42a13 13 0 1 1 0 26 13 13 0 0 1 0-26zm0 7a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
  // ticket
  4: 'M22 34h56v14a6 6 0 0 0 0 12v14H22V60a6 6 0 0 0 0-12zm14 8v22h4V42zm12 0v22h4V42zm12 0v22h4V42z',
  // big top tent
  5: 'M50 18l4 10 4-10-2 12 30 26H18l30-26-2-12zM22 60h56v18H62V66h-8v12H22z',
  // balloon
  6: 'M50 18c13 0 22 10 22 23 0 14-13 23-22 32-9-9-22-18-22-32 0-13 9-23 22-23zm-3 56h6l3 12h-12z',
  // unicycle
  7: 'M50 54a14 14 0 1 1 0 28 14 14 0 0 1 0-28zm0 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM47 22h6v32h-6zM36 18h28v7H36z',
  // lion head with mane
  8: 'M50 20c6 0 10 4 11 9 6-2 11 2 11 8 0 4-2 7-5 9 4 3 6 7 6 12 0 12-10 22-23 22s-23-10-23-22c0-5 2-9 6-12-3-2-5-5-5-9 0-6 5-10 11-8 1-5 5-9 11-9zm-8 34a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm16 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-8 12c-4 0-7 2-7 2 2 4 4 6 7 6s5-2 7-6c0 0-3-2-7-2z',
  // trumpet / fanfare
  9: 'M22 44h16v16H22zM38 40l24-14v52L38 64zM64 32h6v40h-6zM72 40h10v8H72zm0 16h10v8H72z',
  // star trophy
  10: 'M50 14l9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3zM40 76h20v6H40zm-6 8h32v7H34z',
};

export const AVATAR_COLORS = ['#c9574b', '#c99a45', '#3f8e80', '#52649f', '#ad4f7f', '#869c3c', '#cf7a38', '#7d5a9c'];

export const AVATAR_GLYPHS = [1, 5, 3, 7, 10, 4, 2, 9];
