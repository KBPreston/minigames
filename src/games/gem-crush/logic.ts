// Gem Crush Game Logic

import {
  Grid,
  Gem,
  GemType,
  Position,
  Match,
  MatchResult,
  GRID_COLS,
  GRID_ROWS,
  GEM_COLORS,
} from './types';

// Create an empty grid
export function createEmptyGrid(): Grid {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => null)
  );
}

// Create a random gem
export function createGem(excludeColors: number[] = []): Gem {
  const availableColors = GEM_COLORS.map((_, i) => i).filter(
    (i) => !excludeColors.includes(i)
  );
  const colorIndex =
    availableColors[Math.floor(Math.random() * availableColors.length)];

  return {
    color: GEM_COLORS[colorIndex],
    colorIndex,
    type: 'normal',
    offsetY: 0,
    scale: 1,
    shake: 0,
  };
}

// Create a special gem
export function createSpecialGem(
  colorIndex: number,
  type: GemType
): Gem {
  return {
    color: type === 'rainbow' ? '#ffffff' : GEM_COLORS[colorIndex],
    colorIndex: type === 'rainbow' ? -1 : colorIndex,
    type,
    offsetY: 0,
    scale: 0,
    shake: 0,
  };
}

// Initialize grid with no initial matches
export function initializeGrid(): Grid {
  const grid = createEmptyGrid();

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const excludeColors: number[] = [];

      // Check horizontal - exclude colors that would create match
      if (col >= 2) {
        const left1 = grid[row][col - 1];
        const left2 = grid[row][col - 2];
        if (left1 && left2 && left1.colorIndex === left2.colorIndex) {
          excludeColors.push(left1.colorIndex);
        }
      }

      // Check vertical - exclude colors that would create match
      if (row >= 2) {
        const up1 = grid[row - 1][col];
        const up2 = grid[row - 2][col];
        if (up1 && up2 && up1.colorIndex === up2.colorIndex) {
          excludeColors.push(up1.colorIndex);
        }
      }

      grid[row][col] = createGem(excludeColors);
    }
  }

  return grid;
}

// Check if two positions are adjacent
export function areAdjacent(pos1: Position, pos2: Position): boolean {
  const rowDiff = Math.abs(pos1.row - pos2.row);
  const colDiff = Math.abs(pos1.col - pos2.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

// Check if position is valid
export function isValidPosition(pos: Position): boolean {
  return (
    pos.row >= 0 &&
    pos.row < GRID_ROWS &&
    pos.col >= 0 &&
    pos.col < GRID_COLS
  );
}

// Swap two gems in the grid
export function swapGems(grid: Grid, pos1: Position, pos2: Position): void {
  const temp = grid[pos1.row][pos1.col];
  grid[pos1.row][pos1.col] = grid[pos2.row][pos2.col];
  grid[pos2.row][pos2.col] = temp;
}

// Find all matches in the grid
export function findMatches(grid: Grid): Match[] {
  const matches: Match[] = [];

  // Find horizontal matches
  for (let row = 0; row < GRID_ROWS; row++) {
    let col = 0;
    while (col < GRID_COLS) {
      const gem = grid[row][col];
      if (!gem || gem.type === 'rainbow') {
        col++;
        continue;
      }

      let matchLength = 1;
      while (
        col + matchLength < GRID_COLS &&
        grid[row][col + matchLength]?.colorIndex === gem.colorIndex &&
        grid[row][col + matchLength]?.type !== 'rainbow'
      ) {
        matchLength++;
      }

      if (matchLength >= 3) {
        const positions: Position[] = [];
        for (let i = 0; i < matchLength; i++) {
          positions.push({ row, col: col + i });
        }
        matches.push({
          positions,
          isHorizontal: true,
          isVertical: false,
          length: matchLength,
        });
      }

      col += Math.max(1, matchLength);
    }
  }

  // Find vertical matches
  for (let col = 0; col < GRID_COLS; col++) {
    let row = 0;
    while (row < GRID_ROWS) {
      const gem = grid[row][col];
      if (!gem || gem.type === 'rainbow') {
        row++;
        continue;
      }

      let matchLength = 1;
      while (
        row + matchLength < GRID_ROWS &&
        grid[row + matchLength][col]?.colorIndex === gem.colorIndex &&
        grid[row + matchLength][col]?.type !== 'rainbow'
      ) {
        matchLength++;
      }

      if (matchLength >= 3) {
        const positions: Position[] = [];
        for (let i = 0; i < matchLength; i++) {
          positions.push({ row: row + i, col });
        }
        matches.push({
          positions,
          isHorizontal: false,
          isVertical: true,
          length: matchLength,
        });
      }

      row += Math.max(1, matchLength);
    }
  }

  return matches;
}

// Check for L or T shaped matches by finding overlapping matches
export function findLTMatches(matches: Match[]): Position[][] {
  const ltMatches: Position[][] = [];
  const positionMap = new Map<string, Match[]>();

  // Map each position to matches that contain it
  for (const match of matches) {
    for (const pos of match.positions) {
      const key = `${pos.row},${pos.col}`;
      if (!positionMap.has(key)) {
        positionMap.set(key, []);
      }
      positionMap.get(key)!.push(match);
    }
  }

  // Find positions that are part of both horizontal and vertical matches
  const processedMatches = new Set<Match>();
  for (const [, matchList] of positionMap) {
    if (matchList.length >= 2) {
      const hMatch = matchList.find((m) => m.isHorizontal);
      const vMatch = matchList.find((m) => m.isVertical);
      if (hMatch && vMatch && !processedMatches.has(hMatch) && !processedMatches.has(vMatch)) {
        // Combine positions from both matches
        const combined = new Set<string>();
        for (const pos of [...hMatch.positions, ...vMatch.positions]) {
          combined.add(`${pos.row},${pos.col}`);
        }
        ltMatches.push(
          Array.from(combined).map((k) => {
            const [row, col] = k.split(',').map(Number);
            return { row, col };
          })
        );
        processedMatches.add(hMatch);
        processedMatches.add(vMatch);
      }
    }
  }

  return ltMatches;
}

// Determine what special gems to create from matches
export function analyzeMatches(grid: Grid, matches: Match[]): MatchResult {
  const result: MatchResult = {
    matches,
    specialGems: [],
  };

  // Check for L/T shapes first
  const ltMatches = findLTMatches(matches);
  const ltPositions = new Set<string>();
  for (const lt of ltMatches) {
    // Find intersection point for bomb placement
    const positionCounts = new Map<string, number>();
    for (const pos of lt) {
      const key = `${pos.row},${pos.col}`;
      positionCounts.set(key, (positionCounts.get(key) || 0) + 1);
    }

    // Find a central position
    let centerPos: Position | null = null;
    for (const [key] of positionCounts) {
      const [row, col] = key.split(',').map(Number);
      centerPos = { row, col };
      break;
    }

    if (centerPos) {
      const gem = grid[centerPos.row][centerPos.col];
      if (gem) {
        result.specialGems.push({
          position: centerPos,
          type: 'bomb',
          color: gem.color,
          colorIndex: gem.colorIndex,
        });
      }
    }

    for (const pos of lt) {
      ltPositions.add(`${pos.row},${pos.col}`);
    }
  }

  // Process remaining matches
  for (const match of matches) {
    // Skip if already part of L/T
    const isPartOfLT = match.positions.some((pos) =>
      ltPositions.has(`${pos.row},${pos.col}`)
    );
    if (isPartOfLT) continue;

    if (match.length === 5) {
      // Rainbow gem for 5 in a row
      const centerIndex = Math.floor(match.length / 2);
      const centerPos = match.positions[centerIndex];
      const gem = grid[centerPos.row][centerPos.col];
      if (gem) {
        result.specialGems.push({
          position: centerPos,
          type: 'rainbow',
          color: '#ffffff',
          colorIndex: -1,
        });
      }
    } else if (match.length === 4) {
      // Line blaster for 4 in a row
      const centerIndex = Math.floor(match.length / 2);
      const centerPos = match.positions[centerIndex];
      const gem = grid[centerPos.row][centerPos.col];
      if (gem) {
        result.specialGems.push({
          position: centerPos,
          type: match.isHorizontal ? 'line_v' : 'line_h', // Opposite direction
          color: gem.color,
          colorIndex: gem.colorIndex,
        });
      }
    }
  }

  return result;
}

// Get all positions that should be cleared by a special gem
export function getSpecialGemClearPositions(
  grid: Grid,
  pos: Position,
  gem: Gem
): Position[] {
  const positions: Position[] = [];

  switch (gem.type) {
    case 'line_h':
      // Clear entire row
      for (let col = 0; col < GRID_COLS; col++) {
        if (grid[pos.row][col]) {
          positions.push({ row: pos.row, col });
        }
      }
      break;

    case 'line_v':
      // Clear entire column
      for (let row = 0; row < GRID_ROWS; row++) {
        if (grid[row][pos.col]) {
          positions.push({ row, col: pos.col });
        }
      }
      break;

    case 'bomb':
      // Clear 3x3 area
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const newRow = pos.row + dr;
          const newCol = pos.col + dc;
          if (
            isValidPosition({ row: newRow, col: newCol }) &&
            grid[newRow][newCol]
          ) {
            positions.push({ row: newRow, col: newCol });
          }
        }
      }
      break;

    case 'rainbow':
      // This is handled separately during swap
      break;
  }

  return positions;
}

// Get all positions of gems matching a color (for rainbow gem)
export function getColorMatchPositions(grid: Grid, colorIndex: number): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const gem = grid[row][col];
      if (gem && gem.colorIndex === colorIndex) {
        positions.push({ row, col });
      }
    }
  }
  return positions;
}

// Apply gravity - gems fall to fill gaps
export function applyGravity(
  grid: Grid
): { col: number; fromRow: number; toRow: number }[] {
  const movements: { col: number; fromRow: number; toRow: number }[] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    let writeRow = GRID_ROWS - 1;

    // Move existing gems down
    for (let readRow = GRID_ROWS - 1; readRow >= 0; readRow--) {
      if (grid[readRow][col]) {
        if (readRow !== writeRow) {
          movements.push({ col, fromRow: readRow, toRow: writeRow });
          grid[writeRow][col] = grid[readRow][col];
          grid[readRow][col] = null;
        }
        writeRow--;
      }
    }
  }

  return movements;
}

// Fill empty cells with new gems
export function fillEmptyCells(grid: Grid): { row: number; col: number; gem: Gem }[] {
  const newGems: { row: number; col: number; gem: Gem }[] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    let emptyCount = 0;
    for (let row = 0; row < GRID_ROWS; row++) {
      if (!grid[row][col]) {
        emptyCount++;
      }
    }

    // Fill from top
    for (let row = 0; row < GRID_ROWS; row++) {
      if (!grid[row][col]) {
        const gem = createGem();
        gem.offsetY = -(emptyCount - row) * 60; // Start above the grid
        gem.scale = 1;
        grid[row][col] = gem;
        newGems.push({ row, col, gem });
      }
    }
  }

  return newGems;
}

// Check if a swap would result in a match
export function wouldSwapMatch(
  grid: Grid,
  pos1: Position,
  pos2: Position
): boolean {
  const gem1 = grid[pos1.row][pos1.col];
  const gem2 = grid[pos2.row][pos2.col];

  if (!gem1 || !gem2) return false;

  // Rainbow gem always matches if swapped with a colored gem
  if (gem1.type === 'rainbow' && gem2.colorIndex >= 0) return true;
  if (gem2.type === 'rainbow' && gem1.colorIndex >= 0) return true;

  // Special gem activations
  if (gem1.type !== 'normal' || gem2.type !== 'normal') return true;

  // Temporarily swap
  swapGems(grid, pos1, pos2);
  const matches = findMatches(grid);
  // Swap back
  swapGems(grid, pos1, pos2);

  return matches.length > 0;
}

// Find a valid move (for hint system)
export function findValidMove(grid: Grid): { from: Position; to: Position } | null {
  // Check all possible swaps
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const pos1 = { row, col };

      // Check right
      if (col < GRID_COLS - 1) {
        const pos2 = { row, col: col + 1 };
        if (wouldSwapMatch(grid, pos1, pos2)) {
          return { from: pos1, to: pos2 };
        }
      }

      // Check down
      if (row < GRID_ROWS - 1) {
        const pos2 = { row: row + 1, col };
        if (wouldSwapMatch(grid, pos1, pos2)) {
          return { from: pos1, to: pos2 };
        }
      }
    }
  }

  return null;
}

// Check if game is over (no valid moves)
export function isGameOver(grid: Grid): boolean {
  return findValidMove(grid) === null;
}

// Get combo word based on cascade level
export function getComboWord(cascadeLevel: number): { word: string; color: string } {
  if (cascadeLevel >= 5) return { word: 'LEGENDARY!', color: '#fbbf24' };
  if (cascadeLevel >= 4) return { word: 'INCREDIBLE!', color: '#f472b6' };
  if (cascadeLevel >= 3) return { word: 'Amazing!', color: '#a78bfa' };
  if (cascadeLevel >= 2) return { word: 'Great!', color: '#34d399' };
  return { word: 'Nice!', color: '#60a5fa' };
}

// Calculate score for a clear
export function calculateMatchScore(
  matchSize: number,
  isSpecial: boolean,
  cascadeLevel: number
): number {
  let baseScore = 0;

  if (isSpecial) {
    baseScore = 150;
  } else if (matchSize >= 5) {
    baseScore = 500;
  } else if (matchSize >= 4) {
    baseScore = 200;
  } else {
    baseScore = 100;
  }

  return Math.floor(baseScore * cascadeLevel);
}
