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

// Colors for brick health states (strong bricks degrade through these)
export const BRICK_COLORS: Record<BrickType, string[]> = {
  [BrickType.Normal]: ['#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f97316'],
  [BrickType.Strong]: ['#ef4444', '#f97316', '#eab308', '#22c55e'],
  [BrickType.Indestructible]: ['#475569'],
};

export const BALL_COLOR = '#f8fafc';
export const BALL_SPEED = 450; // pixels per second
export const BALL_RADIUS = 8;
