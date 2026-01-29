import {
  Block,
  Vec2,
  GRAVITY,
  BLOCK_PROPERTIES,
  BlockType,
  ContactPoint,
  SupportInfo,
  STATIC_FRICTION,
  KINETIC_FRICTION,
  TIPPING_THRESHOLD,
} from './types';

// Physics constants
const AIR_DRAG = 0.98;
const BOUNCE = 0.15;
const SETTLE_THRESHOLD = 2;
const ROTATION_DAMPING = 0.94;
const CRUSH_VELOCITY = 80;
const ANGULAR_VELOCITY_SETTLE = 0.05;

export interface PhysicsWorld {
  groundY: number;
  leftWall: number;
  rightWall: number;
}

// Track blocks that get crushed this frame
let crushedBlocks: Block[] = [];

export function getCrushedBlocks(): Block[] {
  const result = crushedBlocks;
  crushedBlocks = [];
  return result;
}

/**
 * Calculate the center of mass for a block (accounting for rotation)
 */
function getCenterOfMass(block: Block): Vec2 {
  // For a rectangle, COM is at geometric center
  const localCOM = { x: block.width / 2, y: block.height / 2 };

  // Apply rotation around the block's top-left corner
  if (Math.abs(block.rotation) > 0.01) {
    const cos = Math.cos(block.rotation);
    const sin = Math.sin(block.rotation);
    return {
      x: block.x + localCOM.x * cos - localCOM.y * sin,
      y: block.y + localCOM.x * sin + localCOM.y * cos,
    };
  }

  return {
    x: block.x + localCOM.x,
    y: block.y + localCOM.y,
  };
}

/**
 * Calculate moment of inertia for a rectangular block
 * I = (1/12) * m * (w² + h²) for rectangle rotating about center
 */
function calculateMomentOfInertia(block: Block): number {
  const { width, height, mass } = block;
  return (mass * (width * width + height * height)) / 12;
}

/**
 * Calculate mass based on block type and size
 */
export function calculateMass(block: Block): number {
  const props = BLOCK_PROPERTIES[block.type];
  const area = block.width * block.height;
  return props.weight * area * 0.001; // Scale factor for reasonable values
}

/**
 * Get the rotated corners of a block
 */
function getRotatedCorners(block: Block): Vec2[] {
  const cos = Math.cos(block.rotation);
  const sin = Math.sin(block.rotation);
  const cx = block.x + block.width / 2;
  const cy = block.y + block.height / 2;
  const hw = block.width / 2;
  const hh = block.height / 2;

  // Local corners relative to center
  const localCorners = [
    { x: -hw, y: -hh }, // top-left
    { x: hw, y: -hh },  // top-right
    { x: hw, y: hh },   // bottom-right
    { x: -hw, y: hh },  // bottom-left
  ];

  return localCorners.map(corner => ({
    x: cx + corner.x * cos - corner.y * sin,
    y: cy + corner.x * sin + corner.y * cos,
  }));
}

/**
 * Find the lowest points of a block (for support detection)
 */
function getLowestPoints(block: Block): Vec2[] {
  const corners = getRotatedCorners(block);
  const maxY = Math.max(...corners.map(c => c.y));
  const threshold = 3; // Within 3 pixels of lowest

  return corners.filter(c => c.y >= maxY - threshold);
}

/**
 * Check if a point is supported by a surface
 */
function isPointSupportedByBlock(point: Vec2, supporter: Block): boolean {
  // Simple AABB check for now (could be improved for rotated blocks)
  const margin = 2;
  return (
    point.x >= supporter.x - margin &&
    point.x <= supporter.x + supporter.width + margin &&
    Math.abs(point.y - supporter.y) < 5
  );
}

/**
 * Calculate support information for a block
 */
function calculateSupportInfo(block: Block, allBlocks: Block[], groundY: number): SupportInfo | null {
  const lowestPoints = getLowestPoints(block);
  const supportedBy: Block[] = [];
  const supportPoints: Vec2[] = [];

  // Check ground support
  const onGround = lowestPoints.some(p => p.y >= groundY - 3);

  if (onGround) {
    // Ground supports the block
    const groundPoints = lowestPoints.filter(p => p.y >= groundY - 3);
    supportPoints.push(...groundPoints);
  }

  // Check other blocks for support
  for (const other of allBlocks) {
    if (other === block || other.destroyed) continue;

    for (const point of lowestPoints) {
      if (isPointSupportedByBlock(point, other)) {
        if (!supportedBy.includes(other)) {
          supportedBy.push(other);
        }
        supportPoints.push(point);
      }
    }
  }

  if (supportPoints.length === 0 && !onGround) {
    return null; // No support
  }

  // Calculate support base extents
  const supportXs = supportPoints.map(p => p.x);
  const supportBaseLeft = Math.min(...supportXs);
  const supportBaseRight = Math.max(...supportXs);

  return {
    supportedBy,
    supportPoints,
    supportBaseLeft,
    supportBaseRight,
  };
}

/**
 * Check if a block should start tipping based on center of mass position
 */
function checkTipping(block: Block, supportInfo: SupportInfo | null): boolean {
  if (!supportInfo || supportInfo.supportPoints.length === 0) {
    return false; // No support = falling, not tipping
  }

  const com = getCenterOfMass(block);
  const supportCenter = (supportInfo.supportBaseLeft + supportInfo.supportBaseRight) / 2;
  const supportWidth = supportInfo.supportBaseRight - supportInfo.supportBaseLeft;

  if (supportWidth < 5) {
    // Very narrow support (like a fulcrum) - easy to tip
    const offset = Math.abs(com.x - supportCenter);
    return offset > 2;
  }

  // Normal support - check if COM is outside support base
  const margin = supportWidth * (1 - TIPPING_THRESHOLD) / 2;
  return com.x < supportInfo.supportBaseLeft + margin ||
         com.x > supportInfo.supportBaseRight - margin;
}

/**
 * Calculate torque from gravity when block is tipping
 */
function calculateGravityTorque(block: Block, supportInfo: SupportInfo | null): number {
  if (!supportInfo || supportInfo.supportPoints.length === 0) {
    return 0;
  }

  const com = getCenterOfMass(block);

  // Find the pivot point (edge of support in direction of tip)
  let pivotX: number;
  const supportCenter = (supportInfo.supportBaseLeft + supportInfo.supportBaseRight) / 2;

  if (com.x < supportCenter) {
    pivotX = supportInfo.supportBaseLeft;
  } else {
    pivotX = supportInfo.supportBaseRight;
  }

  // Torque = r × F = distance * force * sin(angle)
  // For gravity, force is downward, so torque = horizontal_distance * weight
  const momentArm = com.x - pivotX;
  const gravityForce = block.mass * GRAVITY;

  // Torque causes rotation (positive = clockwise)
  return momentArm * gravityForce * 0.0001; // Scale factor
}

/**
 * Apply friction forces between block and surface
 */
function applyFriction(
  block: Block,
  normalForce: number,
  surfaceFriction: number,
  dt: number
): void {
  const blockFriction = BLOCK_PROPERTIES[block.type].friction;
  const combinedFriction = (blockFriction + surfaceFriction) / 2;

  const horizontalForce = Math.abs(block.vx) * block.mass;

  if (!block.isSliding) {
    // Static friction - check if force exceeds threshold
    const staticThreshold = normalForce * STATIC_FRICTION * combinedFriction;

    if (horizontalForce > staticThreshold) {
      block.isSliding = true;
      block.staticFrictionExceeded = true;
    } else {
      // Static friction holds - kill horizontal velocity
      block.vx *= 0.1;
      return;
    }
  }

  // Kinetic friction
  if (block.isSliding) {
    const kineticFriction = KINETIC_FRICTION * combinedFriction;
    const frictionDecel = kineticFriction * GRAVITY * dt;

    if (block.vx > 0) {
      block.vx = Math.max(0, block.vx - frictionDecel);
    } else {
      block.vx = Math.min(0, block.vx + frictionDecel);
    }

    // Stop sliding if velocity is low enough
    if (Math.abs(block.vx) < 5) {
      block.isSliding = false;
    }
  }
}

/**
 * Main physics update
 */
export function updatePhysics(blocks: Block[], dt: number, world: PhysicsWorld): void {
  // Reset per-frame state
  for (const block of blocks) {
    if (block.destroyed) continue;
    block.torque = 0;
    block.staticFrictionExceeded = false;
  }

  // Update support info for all blocks
  for (const block of blocks) {
    if (block.destroyed) continue;
    block.supportInfo = calculateSupportInfo(block, blocks, world.groundY);
    block.isSupported = block.supportInfo !== null;
  }

  // Physics integration
  for (const block of blocks) {
    if (block.destroyed) continue;

    // Check for tipping
    block.isTipping = checkTipping(block, block.supportInfo);

    // Apply gravity torque if tipping
    if (block.isTipping && block.supportInfo) {
      block.torque += calculateGravityTorque(block, block.supportInfo);
    }

    // Apply gravity (always)
    block.vy += GRAVITY * dt;

    // Air drag
    block.vx *= AIR_DRAG;

    // Update position
    block.x += block.vx * dt;
    block.y += block.vy * dt;

    // Update rotation from torque
    if (block.momentOfInertia > 0) {
      const angularAccel = block.torque / block.momentOfInertia;
      block.rotationVel += angularAccel * dt;
    }

    // Update rotation
    block.rotation += block.rotationVel * dt;
    block.rotationVel *= ROTATION_DAMPING;

    // Keep rotation in reasonable range
    while (block.rotation > Math.PI) block.rotation -= Math.PI * 2;
    while (block.rotation < -Math.PI) block.rotation += Math.PI * 2;

    // Ground collision
    handleGroundCollision(block, world, dt);

    // Wall collisions
    handleWallCollisions(block, world);

    // Check settled state
    updateSettledState(block);
  }

  // Block-to-block collisions
  resolveBlockCollisions(blocks, world, dt);
}

function handleGroundCollision(block: Block, world: PhysicsWorld, dt: number): void {
  const corners = getRotatedCorners(block);
  const lowestY = Math.max(...corners.map(c => c.y));

  if (lowestY > world.groundY) {
    const penetration = lowestY - world.groundY;

    // Push block up
    block.y -= penetration;

    // Normal force from ground
    const normalForce = block.mass * GRAVITY;

    // Bounce or settle
    if (Math.abs(block.vy) > 15) {
      block.vy = -block.vy * BOUNCE;
      block.rotationVel += (Math.random() - 0.5) * 2;
    } else {
      block.vy = 0;
    }

    // Apply friction
    applyFriction(block, normalForce, 0.7, dt);

    // Dampen rotation on ground
    block.rotationVel *= 0.7;

    // Gradually straighten out
    if (Math.abs(block.rotation) > 0.01 && Math.abs(block.vx) < 5 && Math.abs(block.vy) < 5) {
      block.rotation *= 0.9;
      if (Math.abs(block.rotation) < 0.02) {
        block.rotation = 0;
      }
    }
  }
}

function handleWallCollisions(block: Block, world: PhysicsWorld): void {
  const corners = getRotatedCorners(block);
  const minX = Math.min(...corners.map(c => c.x));
  const maxX = Math.max(...corners.map(c => c.x));

  if (minX < world.leftWall) {
    block.x += world.leftWall - minX;
    block.vx = Math.abs(block.vx) * 0.3;
    block.rotationVel += 0.5;
  }

  if (maxX > world.rightWall) {
    block.x -= maxX - world.rightWall;
    block.vx = -Math.abs(block.vx) * 0.3;
    block.rotationVel -= 0.5;
  }
}

function updateSettledState(block: Block): void {
  const isMoving = Math.abs(block.vx) > SETTLE_THRESHOLD ||
                   Math.abs(block.vy) > SETTLE_THRESHOLD ||
                   Math.abs(block.rotationVel) > ANGULAR_VELOCITY_SETTLE;

  if (isMoving) {
    block.settled = false;
  } else if (block.isSupported && !block.isTipping) {
    block.vx = 0;
    block.vy = 0;
    block.rotationVel = 0;
    block.settled = true;
  }
}

function resolveBlockCollisions(blocks: Block[], world: PhysicsWorld, dt: number): void {
  const activeBlocks = blocks.filter(b => !b.destroyed);

  // Sort by Y position - process from bottom to top for stability
  activeBlocks.sort((a, b) => (b.y + b.height) - (a.y + a.height));

  for (let i = 0; i < activeBlocks.length; i++) {
    for (let j = i + 1; j < activeBlocks.length; j++) {
      const a = activeBlocks[i];
      const b = activeBlocks[j];

      if (a.destroyed || b.destroyed) continue;

      const contact = checkBlockCollision(a, b);
      if (contact) {
        resolveContact(contact, world, dt);
      }
    }
  }
}

function checkBlockCollision(a: Block, b: Block): ContactPoint | null {
  // Use AABB for now, but account for rotation by expanding bounds
  const aCorners = getRotatedCorners(a);
  const bCorners = getRotatedCorners(b);

  const aMinX = Math.min(...aCorners.map(c => c.x));
  const aMaxX = Math.max(...aCorners.map(c => c.x));
  const aMinY = Math.min(...aCorners.map(c => c.y));
  const aMaxY = Math.max(...aCorners.map(c => c.y));

  const bMinX = Math.min(...bCorners.map(c => c.x));
  const bMaxX = Math.max(...bCorners.map(c => c.x));
  const bMinY = Math.min(...bCorners.map(c => c.y));
  const bMaxY = Math.max(...bCorners.map(c => c.y));

  const overlapX = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX);
  const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);

  if (overlapX <= 0 || overlapY <= 0) {
    return null; // No collision
  }

  // Determine collision normal
  const aCenterX = (aMinX + aMaxX) / 2;
  const aCenterY = (aMinY + aMaxY) / 2;
  const bCenterX = (bMinX + bMaxX) / 2;
  const bCenterY = (bMinY + bMaxY) / 2;

  let normalX = 0;
  let normalY = 0;
  let penetration: number;

  if (overlapX < overlapY) {
    // Horizontal collision
    normalX = aCenterX < bCenterX ? -1 : 1;
    penetration = overlapX;
  } else {
    // Vertical collision
    normalY = aCenterY < bCenterY ? -1 : 1;
    penetration = overlapY;
  }

  // Contact point at center of overlap region
  const contactX = Math.max(aMinX, bMinX) + overlapX / 2;
  const contactY = Math.max(aMinY, bMinY) + overlapY / 2;

  return {
    x: contactX,
    y: contactY,
    normalX,
    normalY,
    penetration,
    blockA: a,
    blockB: b,
  };
}

function resolveContact(contact: ContactPoint, world: PhysicsWorld, dt: number): void {
  const { blockA: a, blockB: b, normalX, normalY, penetration } = contact;

  const weightA = a.mass;
  const weightB = b.mass;
  const totalWeight = weightA + weightB;

  // Check for vertical collision (stacking/crushing)
  if (Math.abs(normalY) > Math.abs(normalX)) {
    const topBlock = normalY < 0 ? a : b;
    const bottomBlock = normalY < 0 ? b : a;

    // Check for crushing
    if (topBlock.vy > CRUSH_VELOCITY) {
      const topWeight = BLOCK_PROPERTIES[topBlock.type].weight;
      const bottomWeight = BLOCK_PROPERTIES[bottomBlock.type].weight;

      if (topWeight > bottomWeight) {
        const canCrush =
          (topBlock.type === BlockType.Stone && bottomBlock.type === BlockType.Wood) ||
          (topBlock.type === BlockType.Steel && bottomBlock.type !== BlockType.Steel) ||
          (topBlock.type === BlockType.Stone && bottomBlock.type === BlockType.Beam) ||
          (topBlock.type === BlockType.Steel && bottomBlock.type === BlockType.Beam);

        if (canCrush) {
          bottomBlock.destroyed = true;
          crushedBlocks.push(bottomBlock);
          topBlock.vy *= 0.5;
          return;
        }
      }
    }

    // Separate blocks
    const separationA = penetration * (weightB / totalWeight);
    const separationB = penetration * (weightA / totalWeight);

    a.y += normalY * separationA;
    b.y -= normalY * separationB;

    // Handle stacking
    const bottomIsStable = bottomBlock.settled ||
      bottomBlock.y + bottomBlock.height >= world.groundY - 2;

    if (bottomIsStable) {
      // Top block lands on stable surface
      if (topBlock.vy > 0) {
        if (topBlock.vy > 25) {
          topBlock.vy = -topBlock.vy * BOUNCE;
          // Off-center impact causes rotation
          const impactOffset = contact.x - (topBlock.x + topBlock.width / 2);
          topBlock.rotationVel += impactOffset * 0.02;
        } else {
          topBlock.vy = 0;
        }
      }

      // Apply friction between blocks
      const normalForce = topBlock.mass * GRAVITY;
      const surfaceFriction = BLOCK_PROPERTIES[bottomBlock.type].friction;
      applyFriction(topBlock, normalForce, surfaceFriction, dt);

    } else {
      // Both blocks moving - momentum transfer
      const totalMass = a.mass + b.mass;
      const avgVy = (a.vy * a.mass + b.vy * b.mass) / totalMass;
      a.vy = avgVy;
      b.vy = avgVy;
    }

  } else {
    // Horizontal collision
    const separationA = penetration * (weightB / totalWeight);
    const separationB = penetration * (weightA / totalWeight);

    a.x += normalX * separationA;
    b.x -= normalX * separationB;

    // Reduce horizontal velocity
    a.vx *= 0.3;
    b.vx *= 0.3;

    // Add tumble from side impact
    const impactForce = Math.abs(a.vx - b.vx);
    a.rotationVel += normalX * impactForce * 0.01;
    b.rotationVel -= normalX * impactForce * 0.01;
  }
}

export function applyExplosion(
  blocks: Block[],
  explosionX: number,
  explosionY: number,
  radius: number,
  force: number,
  destroyRadius: number = 0.6
): Block[] {
  const destroyed: Block[] = [];

  for (const block of blocks) {
    if (block.destroyed) continue;

    const com = getCenterOfMass(block);
    const dx = com.x - explosionX;
    const dy = com.y - explosionY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const blockRadius = Math.max(block.width, block.height) / 2;
    if (dist < radius + blockRadius) {
      if (dist < radius * destroyRadius) {
        block.destroyed = true;
        destroyed.push(block);
      } else {
        const strength = 1 - (dist / (radius + blockRadius));
        const normalizedDx = dx / (dist || 1);
        const normalizedDy = dy / (dist || 1);

        // Apply force
        const forceMultiplier = force * strength / block.mass;
        block.vx += normalizedDx * forceMultiplier * 0.4;
        block.vy += normalizedDy * forceMultiplier - 100;

        // Off-center explosions cause rotation
        const offsetX = explosionX - com.x;
        const offsetY = explosionY - com.y;
        const torqueFromExplosion = (offsetX * normalizedDy - offsetY * normalizedDx) * strength;
        block.rotationVel += torqueFromExplosion * 5;

        block.settled = false;
        block.isSliding = true;
      }
    }
  }

  return destroyed;
}

export function allBlocksSettled(blocks: Block[]): boolean {
  return blocks.filter(b => !b.destroyed).every(b => b.settled);
}

export function calculateTowerDestruction(blocks: Block[], groundY: number): number {
  const activeBlocks = blocks.filter(b => !b.destroyed);
  if (activeBlocks.length === 0) return 1;

  const fallenBlocks = activeBlocks.filter(b => {
    return b.y + b.height >= groundY - 5;
  });

  return fallenBlocks.length / activeBlocks.length;
}

/**
 * Initialize physics properties for a block
 */
export function initBlockPhysics(block: Block): void {
  block.mass = calculateMass(block);
  block.momentOfInertia = calculateMomentOfInertia(block);
  block.torque = 0;
  block.isSupported = false;
  block.isTipping = false;
  block.supportInfo = null;
  block.isSliding = false;
  block.staticFrictionExceeded = false;
}
