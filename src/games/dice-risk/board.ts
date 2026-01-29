// Board generation and space logic for Dice Risk v2 - Multiple Board Shapes

import {
  SpaceType,
  BoardSpace,
  SpaceEffect,
  SPACE_COLORS,
  getBoardSizeForLevel,
} from './types';

export type BoardShape = 'ring' | 'serpentine' | 'figure8' | 'diamond' | 'spiral' | 'cross';

/**
 * Generate a board for the given level with varying shapes
 */
export function generateRingBoard(level: number): BoardSpace[] {
  const boardSize = getBoardSizeForLevel(level);
  const board: BoardSpace[] = [];

  // Initialize all as normal
  for (let i = 0; i < boardSize; i++) {
    board.push({
      index: i,
      type: SpaceType.Normal,
      points: 10 * level, // Points scale with level
      label: `+${10 * level}`,
    });
  }

  // Start space (position 0)
  board[0] = {
    index: 0,
    type: SpaceType.Normal,
    points: 0,
    label: 'START',
  };

  // Place special spaces based on level and board size
  placeSpecialSpaces(board, level, boardSize);

  return board;
}

/**
 * Get the board shape for a given level
 */
export function getBoardShape(level: number): BoardShape {
  const shapes: BoardShape[] = ['ring', 'serpentine', 'figure8', 'diamond', 'spiral', 'cross'];
  return shapes[(level - 1) % shapes.length];
}

/**
 * Place special spaces on the board
 * Distribution varies by level - more danger at higher levels
 */
function placeSpecialSpaces(board: BoardSpace[], level: number, boardSize: number): void {
  // Calculate positions for special spaces
  // Jackpot is always opposite start (halfway around)
  const jackpotPos = Math.floor(boardSize / 2);

  // Place jackpot
  const jackpotPoints = 100 + level * 50;
  board[jackpotPos] = {
    index: jackpotPos,
    type: SpaceType.Jackpot,
    points: jackpotPoints,
    diceChange: 2,
    label: `+${jackpotPoints}`,
  };

  // Calculate number of special spaces based on board size
  const numBonus = Math.floor(boardSize * 0.15); // ~15%
  const numDice = Math.floor(boardSize * 0.12); // ~12%
  const numMultDice = Math.floor(boardSize * 0.08); // ~8% - multiplier dice
  const numMult = Math.floor(boardSize * 0.1); // ~10%
  const numPenalty = Math.floor(boardSize * 0.1); // ~10%
  const numDanger = Math.floor(boardSize * 0.1) + Math.min(level - 1, 3); // ~10% + level scaling

  // Get available positions (exclude 0 and jackpot)
  const availablePositions: number[] = [];
  for (let i = 1; i < boardSize; i++) {
    if (i !== jackpotPos) {
      availablePositions.push(i);
    }
  }

  // Shuffle available positions
  shuffleArray(availablePositions);

  let posIndex = 0;

  // Place bonus spaces (+25/+50 points)
  for (let i = 0; i < numBonus && posIndex < availablePositions.length; i++) {
    const pos = availablePositions[posIndex++];
    const points = i < numBonus / 2 ? 25 * level : 50 * level;
    board[pos] = {
      index: pos,
      type: SpaceType.Bonus,
      points,
      label: `+${points}`,
    };
  }

  // Place dice spaces (+1 to +3 dice)
  for (let i = 0; i < numDice && posIndex < availablePositions.length; i++) {
    const pos = availablePositions[posIndex++];
    const diceGain = Math.min(1 + Math.floor(i / 2), 3);
    board[pos] = {
      index: pos,
      type: SpaceType.Dice,
      points: 0,
      diceChange: diceGain,
    };
  }

  // Place multiplier dice spaces (+1 multiplier dice)
  for (let i = 0; i < numMultDice && posIndex < availablePositions.length; i++) {
    const pos = availablePositions[posIndex++];
    board[pos] = {
      index: pos,
      type: SpaceType.MultDice,
      points: 0,
      multDiceChange: 1,
    };
  }

  // Place multiplier spaces
  for (let i = 0; i < numMult && posIndex < availablePositions.length; i++) {
    const pos = availablePositions[posIndex++];
    const is3x = i >= numMult / 2;
    board[pos] = {
      index: pos,
      type: is3x ? SpaceType.Mult3x : SpaceType.Mult2x,
      points: 0,
      label: is3x ? '3x' : '2x',
    };
  }

  // Place penalty spaces (-20 points)
  for (let i = 0; i < numPenalty && posIndex < availablePositions.length; i++) {
    const pos = availablePositions[posIndex++];
    const penalty = -20 * level;
    board[pos] = {
      index: pos,
      type: SpaceType.Penalty,
      points: penalty,
      label: `${penalty}`,
    };
  }

  // Place danger spaces (lose 1-2 dice)
  for (let i = 0; i < numDanger && posIndex < availablePositions.length; i++) {
    const pos = availablePositions[posIndex++];
    const diceLoss = i < numDanger / 2 ? -1 : -2;
    board[pos] = {
      index: pos,
      type: SpaceType.Danger,
      points: 0,
      diceChange: diceLoss,
    };
  }
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Get the display color for a space type
 */
export function getSpaceColor(type: SpaceType): string {
  return SPACE_COLORS[type];
}

/**
 * Calculate the effect of landing on a space
 * @param space The space landed on
 * @param roll The total dice roll value
 * @param level Current level (for multiplier scaling)
 */
export function applySpaceEffect(
  space: BoardSpace,
  roll: number,
  level: number
): SpaceEffect {
  switch (space.type) {
    case SpaceType.Normal:
      return {
        type: space.type,
        points: space.points,
      };

    case SpaceType.Bonus:
      return {
        type: space.type,
        points: space.points,
      };

    case SpaceType.Jackpot:
      return {
        type: space.type,
        points: space.points,
        diceChange: space.diceChange,
      };

    case SpaceType.Dice:
      return {
        type: space.type,
        points: 0,
        diceChange: space.diceChange,
      };

    case SpaceType.MultDice:
      return {
        type: space.type,
        points: 0,
        multDiceChange: space.multDiceChange,
      };

    case SpaceType.Mult2x:
      return {
        type: space.type,
        points: roll * 2 * level,
        multiplier: 2,
        roll,
      };

    case SpaceType.Mult3x:
      return {
        type: space.type,
        points: roll * 3 * level,
        multiplier: 3,
        roll,
      };

    case SpaceType.Penalty:
      return {
        type: space.type,
        points: space.points, // Negative value
      };

    case SpaceType.Danger:
      return {
        type: space.type,
        points: 0,
        diceChange: space.diceChange, // Negative value
      };

    default:
      return {
        type: space.type,
        points: 0,
      };
  }
}

export type SpaceDirection = 'right' | 'down' | 'left' | 'up' | 'down-right' | 'down-left' | 'up-right' | 'up-left';

export interface SpacePosition {
  x: number;
  y: number;
  direction: SpaceDirection; // Direction to NEXT space
}

/**
 * Convert board index to position based on current shape
 */
export function indexToPosition(
  index: number,
  boardSize: number,
  shape: BoardShape
): SpacePosition {
  switch (shape) {
    case 'serpentine':
      return indexToSerpentinePosition(index, boardSize);
    case 'figure8':
      return indexToFigure8Position(index, boardSize);
    case 'diamond':
      return indexToDiamondPosition(index, boardSize);
    case 'spiral':
      return indexToSpiralPosition(index, boardSize);
    case 'cross':
      return indexToCrossPosition(index, boardSize);
    case 'ring':
    default:
      return indexToRingPositionFull(index, boardSize);
  }
}

/**
 * Ring board (Monopoly-style square loop)
 */
function indexToRingPositionFull(index: number, boardSize: number): SpacePosition {
  const gridSize = (boardSize + 4) / 4;

  // Top side: indices 0 to gridSize-1
  if (index < gridSize) {
    return { x: index, y: 0, direction: index < gridSize - 1 ? 'right' : 'down' };
  }

  // Right side
  const rightStart = gridSize;
  const rightCount = gridSize - 2;
  if (index < rightStart + rightCount) {
    const offset = index - rightStart;
    return { x: gridSize - 1, y: offset + 1, direction: offset < rightCount - 1 ? 'down' : 'down' };
  }

  // Bottom side (right to left)
  const bottomStart = rightStart + rightCount;
  if (index < bottomStart + gridSize) {
    const offset = index - bottomStart;
    return { x: gridSize - 1 - offset, y: gridSize - 1, direction: offset < gridSize - 1 ? 'left' : 'up' };
  }

  // Left side (bottom to top)
  const leftStart = bottomStart + gridSize;
  const offset = index - leftStart;
  return { x: 0, y: gridSize - 2 - offset, direction: offset < gridSize - 3 ? 'up' : 'right' };
}

/**
 * Serpentine board (snake pattern)
 */
function indexToSerpentinePosition(index: number, boardSize: number): SpacePosition {
  const cols = 5;
  const rows = Math.ceil(boardSize / cols);
  const row = Math.floor(index / cols);
  const colInRow = index % cols;

  // Alternate direction each row
  const goingRight = row % 2 === 0;
  const x = goingRight ? colInRow : cols - 1 - colInRow;
  const y = row;

  // Determine direction to next space
  let direction: SpaceDirection;
  const isLastInRow = colInRow === cols - 1;
  const isLastRow = row === rows - 1;

  if (isLastInRow && !isLastRow) {
    direction = 'down';
  } else if (goingRight) {
    direction = 'right';
  } else {
    direction = 'left';
  }

  return { x, y, direction };
}

/**
 * Figure-8 board (two connected loops)
 */
function indexToFigure8Position(index: number, boardSize: number): SpacePosition {
  const loopSize = Math.floor(boardSize / 2);
  const halfLoop = Math.floor(loopSize / 2);
  const isSecondLoop = index >= loopSize;
  const localIndex = isSecondLoop ? index - loopSize : index;

  // First loop: top circle, second loop: bottom circle
  const centerY = isSecondLoop ? 4 : 1;
  const centerX = 2.5;

  if (localIndex < halfLoop) {
    // Top half of loop (going right)
    const progress = localIndex / halfLoop;
    const angle = Math.PI + progress * Math.PI;
    return {
      x: centerX + Math.cos(angle) * 2,
      y: centerY + Math.sin(angle) * 1.2,
      direction: localIndex < halfLoop - 1 ? 'right' : 'down',
    };
  } else {
    // Bottom half of loop (going left)
    const progress = (localIndex - halfLoop) / halfLoop;
    const angle = progress * Math.PI;
    return {
      x: centerX + Math.cos(angle) * 2,
      y: centerY + Math.sin(angle) * 1.2,
      direction: localIndex < loopSize - 1 ? 'left' : (isSecondLoop ? 'up' : 'down'),
    };
  }
}

/**
 * Diamond board (rotated square)
 */
function indexToDiamondPosition(index: number, boardSize: number): SpacePosition {
  const sideLength = Math.floor(boardSize / 4);
  const side = Math.floor(index / sideLength);
  const posInSide = index % sideLength;
  const progress = posInSide / sideLength;

  const centerX = 3;
  const centerY = 3;
  const radius = 2.5;

  let x: number, y: number, direction: SpaceDirection;

  switch (side) {
    case 0: // Top-right edge (going down-right)
      x = centerX + progress * radius;
      y = centerY - radius + progress * radius;
      direction = posInSide < sideLength - 1 ? 'down-right' : 'down-left';
      break;
    case 1: // Bottom-right edge (going down-left)
      x = centerX + radius - progress * radius;
      y = centerY + progress * radius;
      direction = posInSide < sideLength - 1 ? 'down-left' : 'up-left';
      break;
    case 2: // Bottom-left edge (going up-left)
      x = centerX - progress * radius;
      y = centerY + radius - progress * radius;
      direction = posInSide < sideLength - 1 ? 'up-left' : 'up-right';
      break;
    default: // Top-left edge (going up-right)
      x = centerX - radius + progress * radius;
      y = centerY - progress * radius;
      direction = posInSide < sideLength - 1 ? 'up-right' : 'down-right';
      break;
  }

  return { x, y, direction };
}

/**
 * Spiral board (inward spiral)
 */
function indexToSpiralPosition(index: number, boardSize: number): SpacePosition {
  const positions: SpacePosition[] = [];
  let x = 0, y = 0;
  let dx = 1, dy = 0;
  let segmentLength = 6;
  let segmentPassed = 0;
  let turnCount = 0;

  for (let i = 0; i < boardSize; i++) {
    let direction: SpaceDirection;
    if (dx === 1) direction = 'right';
    else if (dx === -1) direction = 'left';
    else if (dy === 1) direction = 'down';
    else direction = 'up';

    positions.push({ x, y, direction });

    x += dx;
    y += dy;
    segmentPassed++;

    if (segmentPassed >= segmentLength) {
      segmentPassed = 0;
      // Turn right
      [dx, dy] = [-dy, dx];
      turnCount++;
      if (turnCount % 2 === 0) {
        segmentLength = Math.max(2, segmentLength - 1);
      }
    }
  }

  // Update last space direction to point to first
  if (positions.length > 0) {
    const last = positions[positions.length - 1];
    const first = positions[0];
    if (first.x > last.x) last.direction = 'right';
    else if (first.x < last.x) last.direction = 'left';
    else if (first.y > last.y) last.direction = 'down';
    else last.direction = 'up';
  }

  return positions[index] || { x: 0, y: 0, direction: 'right' };
}

/**
 * Cross board (plus shape)
 */
function indexToCrossPosition(index: number, boardSize: number): SpacePosition {
  const armLength = Math.floor(boardSize / 4);

  // Center at (3, 3), arms extend out
  if (index < armLength) {
    // Top arm (going down)
    return { x: 3, y: index, direction: index < armLength - 1 ? 'down' : 'right' };
  } else if (index < armLength * 2) {
    // Right arm (going right then down)
    const pos = index - armLength;
    return { x: 4 + pos, y: armLength - 1, direction: pos < armLength - 1 ? 'right' : 'down' };
  } else if (index < armLength * 3) {
    // Bottom arm (going down then left)
    const pos = index - armLength * 2;
    return { x: 3 + armLength, y: armLength + pos, direction: pos < armLength - 1 ? 'down' : 'left' };
  } else {
    // Left arm and back to start
    const pos = index - armLength * 3;
    const remaining = boardSize - armLength * 3;
    if (pos < remaining / 2) {
      return { x: 3 + armLength - 1 - pos, y: armLength * 2 - 1, direction: 'left' };
    } else {
      const upPos = pos - Math.floor(remaining / 2);
      return { x: 3, y: armLength * 2 - 2 - upPos, direction: upPos < remaining / 2 - 1 ? 'up' : 'right' };
    }
  }
}

// Keep the old function name for backwards compatibility
export function indexToRingPosition(
  index: number,
  boardSize: number
): { x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' } {
  const pos = indexToRingPositionFull(index, boardSize);
  let side: 'top' | 'right' | 'bottom' | 'left' = 'top';
  if (pos.direction === 'right') side = 'top';
  else if (pos.direction === 'down') side = 'right';
  else if (pos.direction === 'left') side = 'bottom';
  else side = 'left';
  return { x: pos.x, y: pos.y, side };
}

/**
 * Get the pixel position for a space on any board shape
 */
export function getSpacePosition(
  index: number,
  boardSize: number,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  shape: BoardShape = 'ring'
): { x: number; y: number } {
  const pos = indexToPosition(index, boardSize, shape);
  return {
    x: offsetX + pos.x * cellSize + cellSize / 2,
    y: offsetY + pos.y * cellSize + cellSize / 2,
  };
}

/**
 * Get grid size for any shape (used for layout calculations)
 */
export function getGridSize(boardSize: number, shape: BoardShape): { cols: number; rows: number } {
  switch (shape) {
    case 'serpentine':
      return { cols: 5, rows: Math.ceil(boardSize / 5) };
    case 'figure8':
      return { cols: 6, rows: 6 };
    case 'diamond':
      return { cols: 7, rows: 7 };
    case 'spiral':
      return { cols: 7, rows: 7 };
    case 'cross':
      return { cols: 8, rows: Math.floor(boardSize / 4) * 2 };
    case 'ring':
    default:
      const ringSize = (boardSize + 4) / 4;
      return { cols: ringSize, rows: ringSize };
  }
}

/**
 * Get the grid dimensions for a board size (legacy - ring only)
 */
export function getRingGridSize(boardSize: number): number {
  return (boardSize + 4) / 4;
}
