import type { Piece } from './pieces';

export const GRID_COLS = 8;
export const GRID_ROWS = 8;

export type Cell = {
  filled: boolean;
  color: string | null;
};

export type Grid = Cell[][];

export interface PlacementResult {
  success: boolean;
  placedTiles: [number, number][];
  clearedRows: number[];
  clearedCols: number[];
  totalCleared: number;
}

export function createEmptyGrid(): Grid {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({ filled: false, color: null }))
  );
}

export function canPlacePiece(grid: Grid, piece: Piece, row: number, col: number): boolean {
  for (const [dr, dc] of piece.shape) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) {
      return false;
    }
    if (grid[r][c].filled) {
      return false;
    }
  }
  return true;
}

export function hasAnyValidPlacement(grid: Grid, piece: Piece): boolean {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (canPlacePiece(grid, piece, row, col)) {
        return true;
      }
    }
  }
  return false;
}

export function isGameOver(grid: Grid, pieces: Piece[]): boolean {
  return pieces.every((piece) => !hasAnyValidPlacement(grid, piece));
}

export function placePiece(grid: Grid, piece: Piece, row: number, col: number): PlacementResult {
  if (!canPlacePiece(grid, piece, row, col)) {
    return { success: false, placedTiles: [], clearedRows: [], clearedCols: [], totalCleared: 0 };
  }

  const placedTiles: [number, number][] = [];

  // Place the piece
  for (const [dr, dc] of piece.shape) {
    const r = row + dr;
    const c = col + dc;
    grid[r][c] = { filled: true, color: piece.color };
    placedTiles.push([r, c]);
  }

  // Check for complete rows and columns
  const clearedRows: number[] = [];
  const clearedCols: number[] = [];

  // Check rows
  for (let r = 0; r < GRID_ROWS; r++) {
    if (grid[r].every((cell) => cell.filled)) {
      clearedRows.push(r);
    }
  }

  // Check columns
  for (let c = 0; c < GRID_COLS; c++) {
    let colFilled = true;
    for (let r = 0; r < GRID_ROWS; r++) {
      if (!grid[r][c].filled) {
        colFilled = false;
        break;
      }
    }
    if (colFilled) {
      clearedCols.push(c);
    }
  }

  // Clear rows
  for (const r of clearedRows) {
    for (let c = 0; c < GRID_COLS; c++) {
      grid[r][c] = { filled: false, color: null };
    }
  }

  // Clear columns
  for (const c of clearedCols) {
    for (let r = 0; r < GRID_ROWS; r++) {
      grid[r][c] = { filled: false, color: null };
    }
  }

  const totalCleared = clearedRows.length * GRID_COLS + clearedCols.length * GRID_ROWS -
    clearedRows.length * clearedCols.length; // Don't double count intersections

  return {
    success: true,
    placedTiles,
    clearedRows,
    clearedCols,
    totalCleared,
  };
}

export function calculateScore(
  placedCount: number,
  clearedRows: number,
  clearedCols: number,
  comboMultiplier: number
): number {
  let score = 0;
  score += placedCount * 5;
  score += clearedRows * 100;
  score += clearedCols * 100;
  // Bonus for clearing both at once
  if (clearedRows > 0 && clearedCols > 0) {
    score += 50 * clearedRows * clearedCols;
  }
  return Math.floor(score * comboMultiplier);
}
