// Type definitions for Dice Risk game

export enum SpaceType {
  Normal = 'normal',
  Bonus = 'bonus',
  Mult2x = 'mult2x',
  Mult3x = 'mult3x',
  Penalty = 'penalty',
  Star = 'star',
  Danger = 'danger',
  Finish = 'finish',
}

export interface BoardSpace {
  index: number;
  type: SpaceType;
  points: number; // Base points or percentage for Danger
  label?: string; // Display label like "+25", "2x", etc.
}

export interface PlayerState {
  position: number;
  score: number;
}

export enum GamePhase {
  Idle = 'idle',
  Rolling = 'rolling',
  Moving = 'moving',
  Effect = 'effect',
  Finished = 'finished',
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
  [SpaceType.Star]: '#eab308', // Gold
  [SpaceType.Danger]: '#ef4444', // Red
  [SpaceType.Finish]: '#ec4899', // Pink
};
