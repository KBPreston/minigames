// Type definitions for Dice Risk v2 - Endless Board Game

export enum SpaceType {
  Normal = 'normal',
  Bonus = 'bonus',
  Mult2x = 'mult2x',
  Mult3x = 'mult3x',
  Penalty = 'penalty',
  Dice = 'dice', // Awards dice to pool
  MultDice = 'multdice', // Awards multiplier dice (permanent score boost)
  Danger = 'danger', // Costs dice from pool
  Jackpot = 'jackpot', // Big points + dice
}

export interface BoardSpace {
  index: number;
  type: SpaceType;
  points: number; // Base points
  diceChange?: number; // Dice gained/lost
  multDiceChange?: number; // Multiplier dice gained
  label?: string; // Display label like "+25", "2x", etc.
}

export enum GamePhase {
  Idle = 'idle',
  Rolling = 'rolling',
  Moving = 'moving',
  Effect = 'effect',
  LevelUp = 'levelup',
  GameOver = 'gameover',
}

export interface DiceAnimation {
  startTime: number;
  duration: number;
  currentFaces: number[]; // Current displayed face values
  finalFaces: number[]; // Final roll result
}

export interface MoveAnimation {
  startTime: number;
  currentSpace: number;
  targetSpace: number;
  progress: number;
}

export interface SpaceEffect {
  type: SpaceType;
  points: number;
  diceChange?: number;
  multDiceChange?: number; // Change to multiplier dice pool
  multiplier?: number;
  roll?: number;
}

// Space colors matching the plan
export const SPACE_COLORS: Record<SpaceType, string> = {
  [SpaceType.Normal]: '#6b7280', // Gray
  [SpaceType.Bonus]: '#22c55e', // Green
  [SpaceType.Mult2x]: '#3b82f6', // Blue
  [SpaceType.Mult3x]: '#a855f7', // Purple
  [SpaceType.Penalty]: '#f97316', // Orange
  [SpaceType.Dice]: '#06b6d4', // Cyan
  [SpaceType.MultDice]: '#ec4899', // Pink - multiplier dice
  [SpaceType.Danger]: '#ef4444', // Red
  [SpaceType.Jackpot]: '#eab308', // Gold
};

/**
 * Get board size for a given level
 * Level 1-2: 20 spaces (5 per side)
 * Level 3-4: 24 spaces (6 per side)
 * Level 5+: 28 spaces (7 per side)
 */
export function getBoardSizeForLevel(level: number): number {
  if (level <= 2) return 20;
  if (level <= 4) return 24;
  return 28;
}

/**
 * Get starting dice pool for a board size
 */
export function getStartingDice(boardSize: number): number {
  return Math.floor(boardSize / 2);
}
