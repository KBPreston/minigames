export interface Vec2 {
  x: number;
  y: number;
}

export enum BlockType {
  Wood = 'wood',
  Stone = 'stone',
  Steel = 'steel',
}

export interface Block {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  type: BlockType;
  destroyed: boolean;
  settled: boolean; // Block has stopped moving
  rotation: number; // Visual rotation in radians
  rotationVel: number;
}

export interface Explosion {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  active: boolean;
  startTime: number;
}

export interface Tower {
  blocks: Block[];
  groundY: number;
}

// Block properties by type
export const BLOCK_PROPERTIES: Record<BlockType, { color: string; strength: number; weight: number }> = {
  [BlockType.Wood]: { color: '#c4a35a', strength: 1, weight: 1 },
  [BlockType.Stone]: { color: '#94a3b8', strength: 2, weight: 1.5 },
  [BlockType.Steel]: { color: '#64748b', strength: 3, weight: 2 },
};

export const GRAVITY = 800; // pixels per second squared
export const DYNAMITE_COUNT = 3;
export const EXPLOSION_RADIUS = 60;
export const EXPLOSION_FORCE = 400;
export const EXPLOSION_DURATION = 300; // ms
