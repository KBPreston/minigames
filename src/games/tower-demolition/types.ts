export interface Vec2 {
  x: number;
  y: number;
}

export enum BlockType {
  Wood = 'wood',
  Stone = 'stone',
  Steel = 'steel',
  Beam = 'beam', // Long horizontal beam - good for balancing
}

export enum BombType {
  Dynamite = 'dynamite',     // Standard - balanced radius and force
  CartoonBomb = 'cartoon',   // Big radius, medium force
  Cluster = 'cluster',       // Multiple small explosions
  Shockwave = 'shockwave',   // Small damage radius but huge push force
}

// Contact point between two blocks
export interface ContactPoint {
  x: number;
  y: number;
  normalX: number;
  normalY: number;
  penetration: number;
  blockA: Block;
  blockB: Block;
}

// Support relationship between blocks
export interface SupportInfo {
  supportedBy: Block[];      // Blocks this one rests on
  supportPoints: Vec2[];     // Where the support contacts are
  supportBaseLeft: number;   // Left edge of support base
  supportBaseRight: number;  // Right edge of support base
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
  settled: boolean;
  rotation: number;
  rotationVel: number;

  // New physics properties
  mass: number;              // Calculated from type and size
  momentOfInertia: number;   // Rotational inertia
  torque: number;            // Current torque being applied

  // Support and stability
  isSupported: boolean;      // Is this block resting on something?
  isTipping: boolean;        // Is the block currently tipping over?
  supportInfo: SupportInfo | null;

  // Friction state
  isSliding: boolean;        // Currently sliding (kinetic friction)
  staticFrictionExceeded: boolean; // Has overcome static friction this frame
}

export interface Explosion {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  active: boolean;
  startTime: number;
  bombType: BombType;
}

export interface Tower {
  blocks: Block[];
  groundY: number;
}

// Block properties by type
export const BLOCK_PROPERTIES: Record<BlockType, {
  color: string;
  strength: number;
  weight: number;
  friction: number;  // Coefficient of friction
}> = {
  [BlockType.Wood]: { color: '#c4a35a', strength: 1, weight: 1, friction: 0.5 },
  [BlockType.Stone]: { color: '#94a3b8', strength: 2, weight: 1.5, friction: 0.6 },
  [BlockType.Steel]: { color: '#64748b', strength: 3, weight: 2, friction: 0.3 },
  [BlockType.Beam]: { color: '#8b5a2b', strength: 1, weight: 0.8, friction: 0.4 }, // Lighter, longer
};

// Bomb properties by type
export const BOMB_PROPERTIES: Record<BombType, {
  radius: number;
  force: number;
  destroyRadius: number;
  color: string;
  secondaryColor: string;
  name: string;
  icon: string;
}> = {
  [BombType.Dynamite]: {
    radius: 55,
    force: 350,
    destroyRadius: 0.6,
    color: '#ef4444',
    secondaryColor: '#fbbf24',
    name: 'Dynamite',
    icon: 'stick',
  },
  [BombType.CartoonBomb]: {
    radius: 100,
    force: 300,
    destroyRadius: 0.5,
    color: '#1f2937',
    secondaryColor: '#f97316',
    name: 'Mega Bomb',
    icon: 'bomb',
  },
  [BombType.Cluster]: {
    radius: 35,
    force: 250,
    destroyRadius: 0.7,
    color: '#22c55e',
    secondaryColor: '#86efac',
    name: 'Cluster',
    icon: 'cluster',
  },
  [BombType.Shockwave]: {
    radius: 40,
    force: 600,
    destroyRadius: 0.3,
    color: '#8b5cf6',
    secondaryColor: '#c4b5fd',
    name: 'Shockwave',
    icon: 'wave',
  },
};

export const GRAVITY = 800;
export const BOMBS_PER_LEVEL = 3;
export const EXPLOSION_DURATION = 350;

// Physics constants
export const STATIC_FRICTION = 0.6;   // Coefficient - force needed to start sliding
export const KINETIC_FRICTION = 0.4;  // Coefficient - force during sliding (lower)
export const TIPPING_THRESHOLD = 0.7; // How far COM can be from support center before tipping (0-1)
