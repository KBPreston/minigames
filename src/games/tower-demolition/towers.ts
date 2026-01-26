import { Block, BlockType, Tower } from './types';

let blockIdCounter = 0;

function createBlock(
  x: number,
  y: number,
  width: number,
  height: number,
  type: BlockType
): Block {
  return {
    id: blockIdCounter++,
    x,
    y,
    width,
    height,
    vx: 0,
    vy: 0,
    type,
    destroyed: false,
    settled: true,
    rotation: 0,
    rotationVel: 0,
  };
}

export function generateTower(level: number, groundY: number, centerX: number): Tower {
  const blocks: Block[] = [];

  // Tower parameters scale with level
  const baseWidth = 120 - Math.min(level * 5, 40); // Narrower at higher levels
  const floors = Math.min(4 + Math.floor(level / 2), 10); // More floors
  const blockHeight = 25;
  const blockGap = 2;

  // Determine block types based on level
  const stoneChance = Math.min(0.1 + level * 0.05, 0.4);
  const steelChance = level >= 3 ? Math.min((level - 2) * 0.03, 0.15) : 0;

  function getBlockType(): BlockType {
    const rand = Math.random();
    if (rand < steelChance) return BlockType.Steel;
    if (rand < steelChance + stoneChance) return BlockType.Stone;
    return BlockType.Wood;
  }

  // Different tower patterns
  const pattern = level % 5;

  switch (pattern) {
    case 0:
      // Simple stacked tower
      buildSimpleTower(blocks, centerX, groundY, baseWidth, floors, blockHeight, blockGap, getBlockType);
      break;
    case 1:
      // Pyramid tower
      buildPyramidTower(blocks, centerX, groundY, baseWidth, floors, blockHeight, blockGap, getBlockType);
      break;
    case 2:
      // Tower with gaps/windows
      buildWindowTower(blocks, centerX, groundY, baseWidth, floors, blockHeight, blockGap, getBlockType);
      break;
    case 3:
      // Double tower
      buildDoubleTower(blocks, centerX, groundY, baseWidth, floors, blockHeight, blockGap, getBlockType);
      break;
    case 4:
      // Alternating layers tower
      buildAlternatingTower(blocks, centerX, groundY, baseWidth, floors, blockHeight, blockGap, getBlockType);
      break;
  }

  return { blocks, groundY };
}

function buildSimpleTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const blocksPerRow = 3;
  const blockWidth = (baseWidth - gap * (blocksPerRow - 1)) / blocksPerRow;
  const startX = centerX - baseWidth / 2;

  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    for (let i = 0; i < blocksPerRow; i++) {
      const x = startX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }
  }
}

function buildPyramidTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  for (let floor = 0; floor < floors; floor++) {
    const blocksInRow = Math.max(floors - floor, 1);
    const rowWidth = baseWidth * (blocksInRow / floors);
    const blockWidth = (rowWidth - gap * (blocksInRow - 1)) / blocksInRow;
    const startX = centerX - rowWidth / 2;
    const y = groundY - (floor + 1) * (blockHeight + gap);

    for (let i = 0; i < blocksInRow; i++) {
      const x = startX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }
  }
}

function buildWindowTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const blocksPerRow = 3;
  const blockWidth = (baseWidth - gap * (blocksPerRow - 1)) / blocksPerRow;
  const startX = centerX - baseWidth / 2;

  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    for (let i = 0; i < blocksPerRow; i++) {
      // Create "windows" by skipping middle block on alternating floors
      if (floor % 2 === 1 && i === 1) continue;

      const x = startX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }
  }
}

function buildDoubleTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const towerWidth = baseWidth * 0.35;
  const towerGap = baseWidth * 0.3;
  const blocksPerRow = 2;
  const blockWidth = (towerWidth - gap) / blocksPerRow;

  // Left tower
  const leftStartX = centerX - towerGap / 2 - towerWidth;
  // Right tower
  const rightStartX = centerX + towerGap / 2;

  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    // Left tower blocks
    for (let i = 0; i < blocksPerRow; i++) {
      const x = leftStartX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }

    // Right tower blocks
    for (let i = 0; i < blocksPerRow; i++) {
      const x = rightStartX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }

    // Bridge between towers on some floors
    if (floor > 0 && floor % 3 === 0) {
      const bridgeX = leftStartX + towerWidth + gap;
      const bridgeWidth = towerGap - gap * 2;
      blocks.push(createBlock(bridgeX, y, bridgeWidth, blockHeight, BlockType.Steel));
    }
  }
}

function buildAlternatingTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    const isWide = floor % 2 === 0;

    if (isWide) {
      // Wide floor - 3 blocks
      const blocksPerRow = 3;
      const blockWidth = (baseWidth - gap * (blocksPerRow - 1)) / blocksPerRow;
      const startX = centerX - baseWidth / 2;

      for (let i = 0; i < blocksPerRow; i++) {
        const x = startX + i * (blockWidth + gap);
        blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
      }
    } else {
      // Narrow floor - 2 blocks centered
      const narrowWidth = baseWidth * 0.6;
      const blocksPerRow = 2;
      const blockWidth = (narrowWidth - gap) / blocksPerRow;
      const startX = centerX - narrowWidth / 2;

      for (let i = 0; i < blocksPerRow; i++) {
        const x = startX + i * (blockWidth + gap);
        blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
      }
    }
  }
}

// Count remaining blocks
export function getActiveBlockCount(blocks: Block[]): number {
  return blocks.filter(b => !b.destroyed).length;
}

// Check if tower is considered "cleared"
export function isTowerCleared(blocks: Block[], initialCount: number): boolean {
  const remaining = getActiveBlockCount(blocks);
  // Tower is cleared if 80% of blocks are destroyed
  return remaining <= initialCount * 0.2;
}
