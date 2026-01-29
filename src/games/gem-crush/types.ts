// Gem Crush Types

export type GemType = 'normal' | 'line_h' | 'line_v' | 'bomb' | 'rainbow';

export interface Gem {
  color: string;
  colorIndex: number;
  type: GemType;
  // Animation state
  offsetY: number; // For falling animation
  scale: number; // For pop/spawn animation
  shake: number; // For invalid swap shake
}

export type Cell = Gem | null;

export type Grid = Cell[][];

export interface Position {
  row: number;
  col: number;
}

export interface SwapAnimation {
  from: Position;
  to: Position;
  progress: number;
  isReversing: boolean;
}

export interface FallAnimation {
  col: number;
  gems: {
    fromRow: number;
    toRow: number;
    gem: Gem;
    delay: number;
  }[];
}

export interface ClearAnimation {
  positions: Position[];
  progress: number;
  color: string;
}

export interface Match {
  positions: Position[];
  isHorizontal: boolean;
  isVertical: boolean;
  length: number;
}

export interface MatchResult {
  matches: Match[];
  specialGems: { position: Position; type: GemType; color: string; colorIndex: number }[];
}

export interface HintMove {
  from: Position;
  to: Position;
  highlightTime: number;
}

export const GRID_COLS = 8;
export const GRID_ROWS = 8;

export const GEM_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
];

export const POINTS = {
  MATCH_3: 100,
  MATCH_4: 200,
  MATCH_5: 500,
  MATCH_L: 300,
  SPECIAL_ACTIVATION: 150,
};
