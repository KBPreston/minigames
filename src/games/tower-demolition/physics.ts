import { Block, GRAVITY, BLOCK_PROPERTIES, BlockType } from './types';

const GROUND_FRICTION = 0.05;
const AIR_DRAG = 0.98;
const BOUNCE = 0.1;
const SETTLE_THRESHOLD = 3;
const ROTATION_DAMPING = 0.92;
const CRUSH_VELOCITY = 100; // Velocity needed for heavy block to crush light block

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

export function updatePhysics(blocks: Block[], dt: number, world: PhysicsWorld): void {
  for (const block of blocks) {
    if (block.destroyed) continue;

    // Apply gravity
    block.vy += GRAVITY * dt;

    // Air drag on horizontal movement
    block.vx *= AIR_DRAG;

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

      // Only bounce if moving fast enough
      if (Math.abs(block.vy) > 20) {
        block.vy = -block.vy * BOUNCE;
        block.rotationVel += (Math.random() - 0.5) * 1.5;
      } else {
        block.vy = 0;
      }

      // Kill horizontal velocity on ground
      block.vx *= GROUND_FRICTION;
      block.rotationVel *= 0.5;

      // Check if settled
      if (Math.abs(block.vy) < SETTLE_THRESHOLD && Math.abs(block.vx) < SETTLE_THRESHOLD) {
        block.vy = 0;
        block.vx = 0;
        block.rotationVel = 0;
        block.rotation = 0;
        block.settled = true;
      }
    }

    // Wall collisions
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

  // Sort by Y position - process from bottom to top for stability
  activeBlocks.sort((a, b) => (b.y + b.height) - (a.y + a.height));

  for (let i = 0; i < activeBlocks.length; i++) {
    for (let j = i + 1; j < activeBlocks.length; j++) {
      const a = activeBlocks[i];
      const b = activeBlocks[j];

      if (a.destroyed || b.destroyed) continue;

      // AABB overlap check
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

      if (overlapX > 0 && overlapY > 0) {
        const weightA = BLOCK_PROPERTIES[a.type].weight;
        const weightB = BLOCK_PROPERTIES[b.type].weight;
        const totalWeight = weightA + weightB;

        // Determine which block is on top
        const aCenterY = a.y + a.height / 2;
        const bCenterY = b.y + b.height / 2;
        const aOnTop = aCenterY < bCenterY;

        // Check for crushing - heavy block landing on light block
        if (overlapY < overlapX) {
          // Vertical collision
          const topBlock = aOnTop ? a : b;
          const bottomBlock = aOnTop ? b : a;
          const topWeight = BLOCK_PROPERTIES[topBlock.type].weight;
          const bottomWeight = BLOCK_PROPERTIES[bottomBlock.type].weight;

          // Heavy block falling fast onto lighter block = crush
          if (topWeight > bottomWeight && topBlock.vy > CRUSH_VELOCITY) {
            // Stone crushes wood, steel crushes stone and wood
            if ((topBlock.type === BlockType.Stone && bottomBlock.type === BlockType.Wood) ||
                (topBlock.type === BlockType.Steel && bottomBlock.type !== BlockType.Steel)) {
              bottomBlock.destroyed = true;
              crushedBlocks.push(bottomBlock);
              topBlock.vy *= 0.5; // Slow down after crushing
              continue;
            }
          }
        }

        // Resolve collision - push apart
        if (overlapX < overlapY) {
          // Side collision - push horizontally
          const pushDir = a.x < b.x ? -1 : 1;

          // Push proportional to weight
          a.x += pushDir * overlapX * (weightB / totalWeight);
          b.x -= pushDir * overlapX * (weightA / totalWeight);

          // Kill horizontal velocity
          a.vx *= 0.2;
          b.vx *= 0.2;

          // Add tumble
          a.rotationVel += pushDir * 1.0;
          b.rotationVel -= pushDir * 1.0;
        } else {
          // Vertical collision - stacking
          const topBlock = aOnTop ? a : b;
          const bottomBlock = aOnTop ? b : a;

          // Push top block up out of bottom block
          topBlock.y = bottomBlock.y - topBlock.height - 0.5;

          // If bottom block is stable, top block should stop
          const bottomIsStable = bottomBlock.settled ||
            bottomBlock.y + bottomBlock.height >= world.groundY - 2;

          if (bottomIsStable) {
            // Stop vertical movement
            if (topBlock.vy > 0) {
              // Landing - small bounce or just stop
              if (topBlock.vy > 30) {
                topBlock.vy = -topBlock.vy * BOUNCE;
                topBlock.rotationVel += (Math.random() - 0.5) * 1.0;
              } else {
                topBlock.vy = 0;
              }
            }

            // Stop horizontal sliding on stable blocks
            topBlock.vx *= 0.1;

            // Check if top block is now settled
            if (Math.abs(topBlock.vy) < SETTLE_THRESHOLD && Math.abs(topBlock.vx) < SETTLE_THRESHOLD) {
              topBlock.vy = 0;
              topBlock.vx = 0;
              topBlock.rotationVel = 0;
              topBlock.rotation = 0;
              topBlock.settled = true;
            }
          } else {
            // Both blocks moving - transfer some momentum
            const avgVy = (topBlock.vy + bottomBlock.vy) / 2;
            topBlock.vy = avgVy;
            bottomBlock.vy = avgVy;
          }
        }
      }
    }
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

        // Mostly upward force
        block.vx += normalizedDx * force * strength * 0.4;
        block.vy += normalizedDy * force * strength - 120;

        // Tumble
        block.rotationVel += (Math.random() - 0.5) * strength * 10;
        block.settled = false;
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
