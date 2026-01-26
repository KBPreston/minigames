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

// Colors for brick health states
export const BRICK_COLORS: Record<BrickType, string[]> = {
  [BrickType.Normal]: ['#22c55e'],
  [BrickType.Strong]: ['#ef4444', '#f97316', '#eab308', '#22c55e'],
  [BrickType.Indestructible]: ['#64748b'],
};

export const BALL_COLOR = '#f8fafc';
export const BALL_SPEED = 400; // pixels per second
export const BALL_RADIUS = 8;
