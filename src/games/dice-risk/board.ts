// Board generation and space logic for Dice Risk v2 - Ring Board

import {
  SpaceType,
  BoardSpace,
  SpaceEffect,
  SPACE_COLORS,
  getBoardSizeForLevel,
} from './types';

/**
 * Generate a ring board for the given level
 * Board is a square ring (Monopoly-style loop)
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

/**
 * Convert board index to ring position (x, y coordinates)
 * Board is a square ring (perimeter only):
 * For 20 spaces with gridSize=6:
 *     0   1   2   3   4   5
 *    19                   6
 *    18                   7
 *    17                   8
 *    16                   9
 *    15  14  13  12  11  10
 */
export function indexToRingPosition(
  index: number,
  boardSize: number
): { x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' } {
  // For a square ring: perimeter = 4 * gridSize - 4 (corners counted once)
  // So gridSize = (boardSize + 4) / 4
  const gridSize = (boardSize + 4) / 4;

  // Top side: indices 0 to gridSize-1
  if (index < gridSize) {
    return { x: index, y: 0, side: 'top' };
  }

  // Right side: indices gridSize to gridSize + (gridSize-2)
  // (gridSize-2 because top-right and bottom-right corners belong to top/bottom)
  const rightStart = gridSize;
  const rightCount = gridSize - 2;
  if (index < rightStart + rightCount) {
    const offset = index - rightStart;
    return { x: gridSize - 1, y: offset + 1, side: 'right' };
  }

  // Bottom side: indices after right, going right-to-left
  const bottomStart = rightStart + rightCount;
  if (index < bottomStart + gridSize) {
    const offset = index - bottomStart;
    return { x: gridSize - 1 - offset, y: gridSize - 1, side: 'bottom' };
  }

  // Left side: remaining indices, going bottom-to-top
  const leftStart = bottomStart + gridSize;
  const offset = index - leftStart;
  return { x: 0, y: gridSize - 2 - offset, side: 'left' };
}

/**
 * Get the pixel position for a space on the ring board
 */
export function getSpacePosition(
  index: number,
  boardSize: number,
  cellSize: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  const { x, y } = indexToRingPosition(index, boardSize);
  return {
    x: offsetX + x * cellSize + cellSize / 2,
    y: offsetY + y * cellSize + cellSize / 2,
  };
}

/**
 * Get the grid dimensions for a board size
 * For a square ring: perimeter = 4 * gridSize - 4
 * So gridSize = (boardSize + 4) / 4
 */
export function getRingGridSize(boardSize: number): number {
  return (boardSize + 4) / 4;
}
