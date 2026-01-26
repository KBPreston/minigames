export type PieceShape = [number, number][];

export interface Piece {
  shape: PieceShape;
  color: string;
}

// All classic block shapes
const SHAPES: PieceShape[] = [
  // Single
  [[0, 0]],
  // Dominos
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0]],
  // Triominos
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 0]],
  [[0, 0], [0, 1], [1, 1]],
  // Tetrominos
  [[0, 0], [0, 1], [0, 2], [0, 3]], // I
  [[0, 0], [1, 0], [2, 0], [3, 0]], // I vertical
  [[0, 0], [0, 1], [1, 0], [1, 1]], // O
  [[0, 0], [0, 1], [0, 2], [1, 1]], // T
  [[0, 1], [1, 0], [1, 1], [1, 2]], // T up
  [[0, 0], [1, 0], [1, 1], [2, 0]], // T right
  [[0, 0], [0, 1], [0, 2], [1, 0]], // L
  [[0, 0], [0, 1], [1, 1], [2, 1]], // L rot
  [[0, 0], [0, 1], [0, 2], [1, 2]], // J
  [[0, 0], [1, 0], [2, 0], [2, 1]], // J rot
  [[0, 0], [0, 1], [1, 1], [1, 2]], // S
  [[0, 1], [1, 0], [1, 1], [2, 0]], // S rot
  [[0, 1], [0, 2], [1, 0], [1, 1]], // Z
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z rot
  // Pentominos (some)
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], // I5
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]], // P
  [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2]], // P mirror
  // 2x2 + 1
  [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]],
  // 3x3
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
];

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
];

export function generateRandomPiece(): Piece {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { shape, color };
}

export function getPieceBounds(shape: PieceShape): { width: number; height: number } {
  let maxRow = 0;
  let maxCol = 0;
  for (const [row, col] of shape) {
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  }
  return { width: maxCol + 1, height: maxRow + 1 };
}
