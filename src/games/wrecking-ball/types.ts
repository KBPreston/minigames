export interface Vec2 {
  x: number;
  y: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  active: boolean;
}

export enum BrickType {
  Normal = 'normal',
  Strong = 'strong',
  Indestructible = 'indestructible',
  Shield = 'shield', // Protective walls that save balls, don't count for winning
}

export interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  type: BrickType;
  color: string;
}

export interface Level {
  bricks: Brick[];
  ballCount: number;
}

// Colors based on HP - index 0 = 1HP, index 1 = 2HP, etc.
// Goes from green (easy) to red (hard)
export const HP_COLORS = [
  '#22c55e', // 1 HP - green
  '#84cc16', // 2 HP - lime
  '#eab308', // 3 HP - yellow
  '#f97316', // 4 HP - orange
  '#ef4444', // 5 HP - red
  '#dc2626', // 6+ HP - dark red
];

export const INDESTRUCTIBLE_COLOR = '#475569';
export const SHIELD_COLOR = '#38bdf8'; // Light blue for protective shields

export const BALL_COLOR = '#f8fafc';
export const BALL_SPEED = 450; // pixels per second
export const BALL_RADIUS = 8;
