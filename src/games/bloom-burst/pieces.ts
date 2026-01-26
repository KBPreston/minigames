// Polyomino piece definitions
// Each piece is an array of [row, col] offsets from origin (0,0)

export type PieceShape = [number, number][];

export interface Piece {
  shape: PieceShape;
  color: string;
}

// Single tile
const MONO: PieceShape[] = [
  [[0, 0]],
];

// Dominos (2 tiles)
const DOMINO: PieceShape[] = [
  [[0, 0], [0, 1]],   // Horizontal
  [[0, 0], [1, 0]],   // Vertical
];

// Triominos (3 tiles)
const TRIOMINO: PieceShape[] = [
  [[0, 0], [0, 1], [0, 2]],           // I horizontal
  [[0, 0], [1, 0], [2, 0]],           // I vertical
  [[0, 0], [0, 1], [1, 0]],           // L
  [[0, 0], [0, 1], [1, 1]],           // L rotated
  [[0, 0], [1, 0], [1, 1]],           // L rotated
  [[0, 1], [1, 0], [1, 1]],           // L rotated
];

// Tetrominos (4 tiles)
const TETROMINO: PieceShape[] = [
  [[0, 0], [0, 1], [0, 2], [0, 3]],   // I horizontal
  [[0, 0], [1, 0], [2, 0], [3, 0]],   // I vertical
  [[0, 0], [0, 1], [1, 0], [1, 1]],   // O (square)
  [[0, 0], [0, 1], [0, 2], [1, 1]],   // T
  [[0, 1], [1, 0], [1, 1], [2, 1]],   // T vertical
  [[0, 1], [1, 0], [1, 1], [1, 2]],   // T inverted
  [[0, 0], [1, 0], [1, 1], [2, 0]],   // T vertical inverted
  [[0, 0], [1, 0], [1, 1], [2, 1]],   // S
  [[0, 1], [0, 2], [1, 0], [1, 1]],   // S horizontal
  [[0, 0], [1, 0], [1, 1], [2, 1]],   // Z
  [[0, 0], [0, 1], [1, 1], [1, 2]],   // Z horizontal
  [[0, 0], [1, 0], [2, 0], [2, 1]],   // L
  [[0, 0], [0, 1], [0, 2], [1, 0]],   // L horizontal
  [[0, 0], [0, 1], [1, 1], [2, 1]],   // L inverted
  [[0, 2], [1, 0], [1, 1], [1, 2]],   // L horizontal inverted
  [[0, 1], [1, 1], [2, 0], [2, 1]],   // J
  [[0, 0], [1, 0], [1, 1], [1, 2]],   // J horizontal
  [[0, 0], [0, 1], [1, 0], [2, 0]],   // J inverted
  [[0, 0], [0, 1], [0, 2], [1, 2]],   // J horizontal inverted
];

// Pentominos (5 tiles)
const PENTOMINO: PieceShape[] = [
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],   // I horizontal
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],   // I vertical
  [[0, 0], [0, 1], [1, 1], [2, 0], [2, 1]],   // U
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],   // + (plus)
  [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],   // Z
  [[0, 2], [1, 0], [1, 1], [1, 2], [2, 0]],   // S
  [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]],   // Z vertical
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],   // L
  [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]],   // L rotated
  [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],   // J
  [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]],   // J rotated
  [[0, 0], [0, 1], [1, 0], [2, 0], [2, 1]],   // C
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2]],   // C rotated
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]],   // W
  [[0, 2], [1, 1], [1, 2], [2, 0], [2, 1]],   // W mirrored
  [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]],   // Y
  [[0, 0], [1, 0], [1, 1], [2, 0], [3, 0]],   // Y mirrored
  [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],   // T
  [[0, 1], [1, 1], [2, 0], [2, 1], [2, 2]],   // T inverted
];

// Colors for pieces (plant/garden theme)
const COLORS = [
  '#22c55e', // Green
  '#86efac', // Light green
  '#4ade80', // Emerald
  '#a3e635', // Lime
  '#84cc16', // Yellow-green
  '#10b981', // Teal-green
];

export function generateRandomPiece(): Piece {
  // Weight towards larger pieces for more challenge
  const rand = Math.random();
  let shapes: PieceShape[];

  if (rand < 0.05) {
    shapes = MONO;        // 5%
  } else if (rand < 0.20) {
    shapes = DOMINO;      // 15%
  } else if (rand < 0.45) {
    shapes = TRIOMINO;    // 25%
  } else if (rand < 0.75) {
    shapes = TETROMINO;   // 30%
  } else {
    shapes = PENTOMINO;   // 25%
  }

  const shape = shapes[Math.floor(Math.random() * shapes.length)];
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

// Get the center offset of a piece (for centering on tap position)
export function getPieceCenter(shape: PieceShape): { rowOffset: number; colOffset: number } {
  let sumRow = 0;
  let sumCol = 0;
  for (const [row, col] of shape) {
    sumRow += row;
    sumCol += col;
  }
  // Return the offset to subtract from tap position to center the piece
  return {
    rowOffset: Math.round(sumRow / shape.length),
    colOffset: Math.round(sumCol / shape.length),
  };
}
