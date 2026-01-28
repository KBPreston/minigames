import { Block, GRAVITY, BLOCK_PROPERTIES } from './types';

const GROUND_FRICTION = 0.05; // Almost instant stop on ground
const AIR_DRAG = 0.98; // Slight air resistance
const BOUNCE = 0.15;
const SETTLE_THRESHOLD = 5;
const ROTATION_DAMPING = 0.92;

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

    // Air drag on horizontal movement (slows down quickly)
    block.vx *= AIR_DRAG;

    // Update position
    block.x += block.vx * dt;
    block.y += block.vy * dt;

    // Update rotation - tumbling!
    block.rotation += block.rotationVel * dt;
    block.rotationVel *= ROTATION_DAMPING;

    // Ground collision
    const blockBottom = block.y + block.height;
    if (blockBottom > world.groundY) {
      block.y = world.groundY - block.height;
      block.vy = -block.vy * BOUNCE;

      // Kill horizontal velocity on ground - no sliding!
      block.vx *= GROUND_FRICTION;

      // Convert some impact into tumble rotation
      if (Math.abs(block.vy) > 20) {
        block.rotationVel += (Math.random() - 0.5) * 2;
      }
      block.rotationVel *= 0.7;

      // Check if settled
      if (Math.abs(block.vy) < SETTLE_THRESHOLD && Math.abs(block.vx) < SETTLE_THRESHOLD) {
        block.vy = 0;
        block.vx = 0;
        block.rotationVel = 0;
        block.rotation = 0; // Reset rotation when settled
        block.settled = true;
      }
    }

    // Wall collisions - just stop, don't bounce sideways
    if (block.x < world.leftWall) {
      block.x = world.leftWall;
      block.vx = 0;
    }
    if (block.x + block.width > world.rightWall) {
      block.x = world.rightWall - block.width;
      block.vx = 0;
    }

    // Unsettle if moving
    if (Math.abs(block.vx) > SETTLE_THRESHOLD || Math.abs(block.vy) > SETTLE_THRESHOLD) {
      block.settled = false;
    }
  }

  // Block-to-block collisions
  resolveBlockCollisions(blocks, world);
}

function resolveBlockCollisions(blocks: Block[], world: PhysicsWorld): void {
  const activeBlocks = blocks.filter(b => !b.destroyed);

  for (let i = 0; i < activeBlocks.length; i++) {
    for (let j = i + 1; j < activeBlocks.length; j++) {
      const a = activeBlocks[i];
      const b = activeBlocks[j];

      // AABB overlap check
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

      if (overlapX > 0 && overlapY > 0) {
        const weightA = BLOCK_PROPERTIES[a.type].weight;
        const weightB = BLOCK_PROPERTIES[b.type].weight;
        const totalWeight = weightA + weightB;

        // Determine which block is on top
        const aOnTop = a.y + a.height / 2 < b.y + b.height / 2;

        if (overlapX < overlapY) {
          // Side collision - just push apart, minimal velocity transfer
          const pushDir = a.x < b.x ? -1 : 1;
          const pushA = (overlapX * weightB / totalWeight) * pushDir;
          const pushB = (overlapX * weightA / totalWeight) * -pushDir;

          a.x += pushA;
          b.x += pushB;

          // No horizontal velocity exchange - just stop
          a.vx *= 0.3;
          b.vx *= 0.3;

          // Add tumble rotation instead
          a.rotationVel += pushDir * 1.5;
          b.rotationVel -= pushDir * 1.5;
        } else {
          // Vertical collision - stacking
          const pushDir = a.y < b.y ? -1 : 1;
          const pushA = (overlapY * weightB / totalWeight) * pushDir;
          const pushB = (overlapY * weightA / totalWeight) * -pushDir;

          a.y += pushA;
          b.y += pushB;

          // Block on top lands on bottom block
          if (aOnTop) {
            // A is on top of B
            if (b.settled || b.y + b.height >= world.groundY - 5) {
              // B is grounded, A should stop falling
              a.vy = Math.min(a.vy, 0);
              a.vx *= 0.2; // Stop sliding on top of other blocks too
            }
          } else {
            // B is on top of A
            if (a.settled || a.y + a.height >= world.groundY - 5) {
              b.vy = Math.min(b.vy, 0);
              b.vx *= 0.2;
            }
          }

          // Small tumble from landing
          a.rotationVel += (Math.random() - 0.5) * 0.8;
          b.rotationVel += (Math.random() - 0.5) * 0.8;
        }
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
  force: number,
  destroyRadius: number = 0.6
): Block[] {
  const destroyed: Block[] = [];

  for (const block of blocks) {
    if (block.destroyed) continue;

    const blockCenterX = block.x + block.width / 2;
    const blockCenterY = block.y + block.height / 2;

    const dx = blockCenterX - explosionX;
    const dy = blockCenterY - explosionY;
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

        // Mostly upward force, reduced horizontal
        block.vx += normalizedDx * force * strength * 0.4; // Reduced horizontal
        block.vy += normalizedDy * force * strength - 120; // Strong upward

        // More tumble rotation from explosions
        block.rotationVel += (Math.random() - 0.5) * strength * 10;
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

  const fallenBlocks = activeBlocks.filter(b => {
    return b.y + b.height >= groundY - 5;
  });

  return fallenBlocks.length / activeBlocks.length;
}
