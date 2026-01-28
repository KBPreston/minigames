// Board generation and space logic for Dice Risk

import { SpaceType, BoardSpace, SpaceEffect, SPACE_COLORS } from './types';

const BOARD_SIZE = 35;

/**
 * Generate the 35-space board with strategic placement
 * Distribution:
 * - Normal: 14 (fill gaps)
 * - Bonus: 6 (+25/+50)
 * - Mult 2x: 4 (positions 8, 15, 22, 28)
 * - Mult 3x: 2 (positions 18, 30)
 * - Penalty: 4 (-20, near bonuses)
 * - Star: 2 (+100, positions 12, 26)
 * - Danger: 2 (-15%, positions 20, 31)
 * - Finish: 1 (+200, position 34)
 */
export function generateBoard(): BoardSpace[] {
  const board: BoardSpace[] = [];

  // Initialize all as normal
  for (let i = 0; i < BOARD_SIZE; i++) {
    board.push({
      index: i,
      type: SpaceType.Normal,
      points: 10,
      label: '+10',
    });
  }

  // Start space (position 0)
  board[0] = {
    index: 0,
    type: SpaceType.Normal,
    points: 0,
    label: 'START',
  };

  // Finish (position 34)
  board[34] = {
    index: 34,
    type: SpaceType.Finish,
    points: 200,
    label: '+200',
  };

  // Stars (+100) at positions 12, 26
  board[12] = { index: 12, type: SpaceType.Star, points: 100, label: '+100' };
  board[26] = { index: 26, type: SpaceType.Star, points: 100, label: '+100' };

  // Mult 2x at positions 8, 15, 22, 28
  board[8] = { index: 8, type: SpaceType.Mult2x, points: 0, label: '2x' };
  board[15] = { index: 15, type: SpaceType.Mult2x, points: 0, label: '2x' };
  board[22] = { index: 22, type: SpaceType.Mult2x, points: 0, label: '2x' };
  board[28] = { index: 28, type: SpaceType.Mult2x, points: 0, label: '2x' };

  // Mult 3x at positions 18, 30
  board[18] = { index: 18, type: SpaceType.Mult3x, points: 0, label: '3x' };
  board[30] = { index: 30, type: SpaceType.Mult3x, points: 0, label: '3x' };

  // Danger (-15%) at positions 20, 31
  board[20] = { index: 20, type: SpaceType.Danger, points: 15, label: '-15%' };
  board[31] = { index: 31, type: SpaceType.Danger, points: 15, label: '-15%' };

  // Bonuses at positions 4, 9, 14, 19, 24, 32
  board[4] = { index: 4, type: SpaceType.Bonus, points: 25, label: '+25' };
  board[9] = { index: 9, type: SpaceType.Bonus, points: 25, label: '+25' };
  board[14] = { index: 14, type: SpaceType.Bonus, points: 50, label: '+50' };
  board[19] = { index: 19, type: SpaceType.Bonus, points: 25, label: '+25' };
  board[24] = { index: 24, type: SpaceType.Bonus, points: 50, label: '+50' };
  board[32] = { index: 32, type: SpaceType.Bonus, points: 25, label: '+25' };

  // Penalties at positions 5, 11, 21, 25 (near bonuses/stars)
  board[5] = { index: 5, type: SpaceType.Penalty, points: -20, label: '-20' };
  board[11] = { index: 11, type: SpaceType.Penalty, points: -20, label: '-20' };
  board[21] = { index: 21, type: SpaceType.Penalty, points: -20, label: '-20' };
  board[25] = { index: 25, type: SpaceType.Penalty, points: -20, label: '-20' };

  return board;
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
 * @param currentScore Current player score (for danger percentage)
 */
export function applySpaceEffect(
  space: BoardSpace,
  roll: number,
  currentScore: number
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

    case SpaceType.Star:
      return {
        type: space.type,
        points: space.points,
      };

    case SpaceType.Finish:
      return {
        type: space.type,
        points: space.points,
      };

    case SpaceType.Mult2x:
      return {
        type: space.type,
        points: roll * 2,
        multiplier: 2,
        roll,
      };

    case SpaceType.Mult3x:
      return {
        type: space.type,
        points: roll * 3,
        multiplier: 3,
        roll,
      };

    case SpaceType.Penalty:
      return {
        type: space.type,
        points: space.points, // Negative value
      };

    case SpaceType.Danger:
      // Lose 15% of current score
      const loss = Math.floor(currentScore * (space.points / 100));
      return {
        type: space.type,
        points: -loss,
      };

    default:
      return {
        type: space.type,
        points: 0,
      };
  }
}

/**
 * Convert board index to serpentine grid position
 * Board is 7 columns wide, serpentine pattern
 */
export function indexToGridPosition(index: number): { row: number; col: number } {
  const cols = 7;
  const row = Math.floor(index / cols);
  const isReversedRow = row % 2 === 1;
  const colInRow = index % cols;
  const col = isReversedRow ? cols - 1 - colInRow : colInRow;

  return { row, col };
}

/**
 * Get the pixel position for a space on the board
 */
export function getSpacePosition(
  index: number,
  cellWidth: number,
  cellHeight: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  const { row, col } = indexToGridPosition(index);
  return {
    x: offsetX + col * cellWidth + cellWidth / 2,
    y: offsetY + row * cellHeight + cellHeight / 2,
  };
}
