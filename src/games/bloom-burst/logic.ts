import type { Piece } from './pieces';

export const GRID_SIZE = 8;

export type Cell = {
  filled: boolean;
  color: string | null;
  bursting?: boolean;
};

export type Grid = Cell[][];

export interface PlacementResult {
  success: boolean;
  placedTiles: [number, number][];
  spreadTiles: [number, number][];
  bursts: BurstResult[];
  totalCleared: number;
}

export interface BurstResult {
  origin: [number, number];
  clearedTiles: [number, number][];
}

export function createEmptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ filled: false, color: null }))
  );
}

export function canPlacePiece(grid: Grid, piece: Piece, row: number, col: number): boolean {
  for (const [dr, dc] of piece.shape) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) {
      return false;
    }
    if (grid[r][c].filled) {
      return false;
    }
  }
  return true;
}

export function hasAnyValidPlacement(grid: Grid, piece: Piece): boolean {
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
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

export function placePiece(
  grid: Grid,
  piece: Piece,
  row: number,
  col: number
): PlacementResult {
  if (!canPlacePiece(grid, piece, row, col)) {
    return { success: false, placedTiles: [], spreadTiles: [], bursts: [], totalCleared: 0 };
  }

  const placedTiles: [number, number][] = [];

  // Place the piece
  for (const [dr, dc] of piece.shape) {
    const r = row + dr;
    const c = col + dc;
    grid[r][c] = { filled: true, color: piece.color };
    placedTiles.push([r, c]);
  }

  // Check for bursts (chain reaction)
  const allBursts: BurstResult[] = [];
  let totalCleared = 0;

  let hasMoreBursts = true;
  while (hasMoreBursts) {
    const burstResults = findAndClearBursts(grid);
    if (burstResults.length === 0) {
      hasMoreBursts = false;
    } else {
      allBursts.push(...burstResults);
      for (const burst of burstResults) {
        totalCleared += burst.clearedTiles.length;
      }
    }
  }

  return {
    success: true,
    placedTiles,
    spreadTiles: [],
    bursts: allBursts,
    totalCleared,
  };
}

function findAndClearBursts(grid: Grid): BurstResult[] {
  const bursts: BurstResult[] = [];
  const visited = new Set<string>();

  // Find all 3x3 squares of filled cells
  for (let row = 0; row < GRID_SIZE - 2; row++) {
    for (let col = 0; col < GRID_SIZE - 2; col++) {
      const key = `${row},${col}`;
      if (visited.has(key)) continue;

      // Check if 3x3 square is filled
      let allFilled = true;
      for (let dr = 0; dr < 3 && allFilled; dr++) {
        for (let dc = 0; dc < 3 && allFilled; dc++) {
          if (!grid[row + dr][col + dc].filled) {
            allFilled = false;
          }
        }
      }

      if (allFilled) {
        visited.add(key);

        // Start with the 3x3 square
        const clearedTiles: [number, number][] = [];
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            clearedTiles.push([row + dr, col + dc]);
          }
        }

        // Propagation: spread to adjacent filled cells
        const propagated = propagateBurst(grid, clearedTiles);
        clearedTiles.push(...propagated);

        bursts.push({
          origin: [row, col],
          clearedTiles,
        });
      }
    }
  }

  // Clear all tiles from all bursts
  for (const burst of bursts) {
    for (const [r, c] of burst.clearedTiles) {
      grid[r][c] = { filled: false, color: null, bursting: true };
    }
  }

  // Reset bursting flag (for animation purposes, done immediately here)
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c].bursting) {
        grid[r][c].bursting = false;
      }
    }
  }

  return bursts;
}

// Propagate burst to orthogonally adjacent filled cells
function propagateBurst(grid: Grid, initialTiles: [number, number][]): [number, number][] {
  const propagated: [number, number][] = [];
  const visited = new Set<string>(initialTiles.map(([r, c]) => `${r},${c}`));
  const queue = [...initialTiles];

  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;

    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;

      if (
        nr >= 0 && nr < GRID_SIZE &&
        nc >= 0 && nc < GRID_SIZE &&
        !visited.has(key) &&
        grid[nr][nc].filled
      ) {
        visited.add(key);
        propagated.push([nr, nc]);
        queue.push([nr, nc]);
      }
    }
  }

  return propagated;
}

export function calculateScore(
  placedCount: number,
  bursts: BurstResult[],
  comboMultiplier: number
): number {
  let score = 0;

  // +10 per tile placed
  score += placedCount * 10;

  // +100 per 3x3 burst (plus propagation bonus)
  score += bursts.length * 100;

  // Apply combo multiplier for chain reactions
  score = Math.floor(score * comboMultiplier);

  return score;
}
