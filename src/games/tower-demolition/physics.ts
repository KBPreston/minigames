import { Block, GRAVITY, BLOCK_PROPERTIES } from './types';

const FRICTION = 0.8;
const BOUNCE = 0.3;
const SETTLE_THRESHOLD = 5; // Velocity threshold for settling
const ROTATION_DAMPING = 0.95;

export interface PhysicsWorld {
  groundY: number;
  leftWall: number;
  rightWall: number;
}

// Apply gravity and update positions
export function updatePhysics(blocks: Block[], dt: number, world: PhysicsWorld): void {
  for (const block of blocks) {
    if (block.destroyed) continue;

    // Apply gravity
    block.vy += GRAVITY * dt;

    // Update position
    block.x += block.vx * dt;
    block.y += block.vy * dt;

    // Update rotation
    block.rotation += block.rotationVel * dt;
    block.rotationVel *= ROTATION_DAMPING;

    // Ground collision
    const blockBottom = block.y + block.height;
    if (blockBottom > world.groundY) {
      block.y = world.groundY - block.height;
      block.vy = -block.vy * BOUNCE;
      block.vx *= FRICTION;
      block.rotationVel *= 0.5;

      // Check if settled
      if (Math.abs(block.vy) < SETTLE_THRESHOLD && Math.abs(block.vx) < SETTLE_THRESHOLD) {
        block.vy = 0;
        block.vx = 0;
        block.rotationVel = 0;
        block.settled = true;
      }
    }

    // Wall collisions
    if (block.x < world.leftWall) {
      block.x = world.leftWall;
      block.vx = -block.vx * BOUNCE;
    }
    if (block.x + block.width > world.rightWall) {
      block.x = world.rightWall - block.width;
      block.vx = -block.vx * BOUNCE;
    }

    // Unsettle if moving
    if (Math.abs(block.vx) > SETTLE_THRESHOLD || Math.abs(block.vy) > SETTLE_THRESHOLD) {
      block.settled = false;
    }
  }

  // Block-to-block collisions
  resolveBlockCollisions(blocks);
}

function resolveBlockCollisions(blocks: Block[]): void {
  const activeBlocks = blocks.filter(b => !b.destroyed);

  for (let i = 0; i < activeBlocks.length; i++) {
    for (let j = i + 1; j < activeBlocks.length; j++) {
      const a = activeBlocks[i];
      const b = activeBlocks[j];

      // AABB overlap check
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

      if (overlapX > 0 && overlapY > 0) {
        // Collision detected - resolve by pushing apart
        const weightA = BLOCK_PROPERTIES[a.type].weight;
        const weightB = BLOCK_PROPERTIES[b.type].weight;
        const totalWeight = weightA + weightB;

        // Determine push direction (smallest overlap)
        if (overlapX < overlapY) {
          // Push horizontally
          const pushDir = a.x < b.x ? -1 : 1;
          const pushA = (overlapX * weightB / totalWeight) * pushDir;
          const pushB = (overlapX * weightA / totalWeight) * -pushDir;

          a.x += pushA;
          b.x += pushB;

          // Exchange some velocity
          const avgVx = (a.vx * weightA + b.vx * weightB) / totalWeight;
          a.vx = avgVx + pushDir * 20;
          b.vx = avgVx - pushDir * 20;
        } else {
          // Push vertically
          const pushDir = a.y < b.y ? -1 : 1;
          const pushA = (overlapY * weightB / totalWeight) * pushDir;
          const pushB = (overlapY * weightA / totalWeight) * -pushDir;

          a.y += pushA;
          b.y += pushB;

          // Block on top gets support
          if (a.y < b.y) {
            a.vy = Math.min(a.vy, b.vy);
            if (b.settled) {
              a.vy *= FRICTION;
            }
          } else {
            b.vy = Math.min(b.vy, a.vy);
            if (a.settled) {
              b.vy *= FRICTION;
            }
          }
        }

        // Add some rotation from collision
        a.rotationVel += (Math.random() - 0.5) * 0.5;
        b.rotationVel += (Math.random() - 0.5) * 0.5;
      }
    }
  }
}

// Apply explosion force to blocks
export function applyExplosion(
  blocks: Block[],
  explosionX: number,
  explosionY: number,
  radius: number,
  force: number
): Block[] {
  const destroyed: Block[] = [];

  for (const block of blocks) {
    if (block.destroyed) continue;

    // Get block center
    const blockCenterX = block.x + block.width / 2;
    const blockCenterY = block.y + block.height / 2;

    // Distance from explosion
    const dx = blockCenterX - explosionX;
    const dy = blockCenterY - explosionY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Check if in explosion radius
    const blockRadius = Math.max(block.width, block.height) / 2;
    if (dist < radius + blockRadius) {
      // Direct hit - destroy block
      if (dist < radius * 0.6) {
        block.destroyed = true;
        destroyed.push(block);
      } else {
        // Apply force - stronger closer to center
        const strength = 1 - (dist / (radius + blockRadius));
        const normalizedDx = dx / (dist || 1);
        const normalizedDy = dy / (dist || 1);

        block.vx += normalizedDx * force * strength;
        block.vy += normalizedDy * force * strength - 100; // Slight upward boost
        block.rotationVel += (Math.random() - 0.5) * strength * 5;
        block.settled = false;
      }
    }
  }

  return destroyed;
}

// Check if all blocks have settled
export function allBlocksSettled(blocks: Block[]): boolean {
  return blocks.filter(b => !b.destroyed).every(b => b.settled);
}

// Check if tower is "destroyed" (most blocks fallen/destroyed)
export function calculateTowerDestruction(blocks: Block[], groundY: number): number {
  const activeBlocks = blocks.filter(b => !b.destroyed);
  if (activeBlocks.length === 0) return 1;

  // Count blocks that have fallen to ground level
  const fallenBlocks = activeBlocks.filter(b => {
    return b.y + b.height >= groundY - 5;
  });

  return fallenBlocks.length / activeBlocks.length;
}
