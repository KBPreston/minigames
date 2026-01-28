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

  // More floors as level increases - tall wobbly towers!
  const floors = Math.min(6 + Math.floor(level * 0.8), 12);
  const blockHeight = 22;
  const blockGap = 2;

  // Block types - more wood (easier to destroy)
  const stoneChance = Math.min(0.05 + level * 0.03, 0.25);
  const steelChance = level >= 3 ? Math.min((level - 2) * 0.02, 0.1) : 0;

  function getBlockType(): BlockType {
    const rand = Math.random();
    if (rand < steelChance) return BlockType.Steel;
    if (rand < steelChance + stoneChance) return BlockType.Stone;
    return BlockType.Wood;
  }

  // Fun wobbly tower patterns
  const patterns = [
    buildTallTower,
    buildTopHeavyTower,
    buildWobblyStack,
    buildTwinTowers,
    buildInvertedTower,
    buildPrecariousPile,
    buildSkyscraper,
    buildMushroomTower,
  ];

  const pattern = patterns[level % patterns.length];
  pattern(blocks, centerX, groundY, floors, blockHeight, blockGap, getBlockType);

  return { blocks, groundY };
}

// Classic tall narrow tower - satisfying to topple
function buildTallTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const towerWidth = 70;
  const blocksPerRow = 2;
  const blockWidth = (towerWidth - gap) / blocksPerRow;
  const startX = centerX - towerWidth / 2;

  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    for (let i = 0; i < blocksPerRow; i++) {
      const x = startX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }
  }
}

// Wider at top than bottom - wants to fall over!
function buildTopHeavyTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    // Gets wider as we go up
    const widthProgress = floor / Math.max(floors - 1, 1);
    const blocksInRow = 1 + Math.floor(widthProgress * 3); // 1 to 4 blocks
    const rowWidth = blocksInRow * 35;
    const blockWidth = (rowWidth - gap * (blocksInRow - 1)) / blocksInRow;
    const startX = centerX - rowWidth / 2;

    for (let i = 0; i < blocksInRow; i++) {
      const x = startX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }
  }
}

// Single column of blocks - super wobbly
function buildWobblyStack(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const blockWidth = 50;

  for (let floor = 0; floor < floors + 2; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    // Slight random offset for wobbliness
    const offset = (Math.random() - 0.5) * 8;
    const x = centerX - blockWidth / 2 + offset;
    blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
  }
}

// Two tall towers side by side
function buildTwinTowers(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const towerWidth = 40;
  const towerGap = 50;

  // Left tower
  const leftX = centerX - towerGap / 2 - towerWidth;
  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    blocks.push(createBlock(leftX, y, towerWidth, blockHeight, getType()));
  }

  // Right tower
  const rightX = centerX + towerGap / 2;
  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    blocks.push(createBlock(rightX, y, towerWidth, blockHeight, getType()));
  }

  // Precarious bridge at top
  const bridgeY = groundY - floors * (blockHeight + gap);
  const bridgeWidth = towerGap + towerWidth * 2;
  blocks.push(createBlock(centerX - bridgeWidth / 2, bridgeY, bridgeWidth, blockHeight, BlockType.Wood));
}

// Narrow at bottom, bulges out, narrow at top - very unstable
function buildInvertedTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    // Bulge in the middle
    const progress = floor / Math.max(floors - 1, 1);
    const bulge = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
    const blocksInRow = 1 + Math.floor(bulge * 3); // 1 to 4 blocks
    const rowWidth = blocksInRow * 40;
    const blockWidth = (rowWidth - gap * Math.max(blocksInRow - 1, 0)) / blocksInRow;
    const startX = centerX - rowWidth / 2;

    for (let i = 0; i < blocksInRow; i++) {
      const x = startX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }
  }
}

// Messy pile that looks ready to collapse
function buildPrecariousPile(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const totalBlocks = floors * 2;

  // Base layer - couple blocks
  let currentY = groundY - blockHeight - gap;
  blocks.push(createBlock(centerX - 50, currentY, 45, blockHeight, getType()));
  blocks.push(createBlock(centerX + 5, currentY, 45, blockHeight, getType()));

  // Stack more blocks precariously on top
  for (let i = 2; i < totalBlocks; i++) {
    currentY -= blockHeight + gap;
    const width = 30 + Math.random() * 40;
    const offset = (Math.random() - 0.5) * 40;
    const x = centerX - width / 2 + offset;
    blocks.push(createBlock(x, currentY, width, blockHeight, getType()));
  }
}

// Very tall and thin - like a real skyscraper
function buildSkyscraper(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const baseWidth = 80;
  const topWidth = 40;

  for (let floor = 0; floor < floors + 3; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    // Tapers slightly as it goes up
    const progress = floor / (floors + 2);
    const rowWidth = baseWidth - (baseWidth - topWidth) * progress;
    const blocksInRow = rowWidth > 50 ? 2 : 1;
    const blockWidth = (rowWidth - gap * (blocksInRow - 1)) / blocksInRow;
    const startX = centerX - rowWidth / 2;

    for (let i = 0; i < blocksInRow; i++) {
      const x = startX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }
  }
}

// Thin stem with big top - mushroom shape
function buildMushroomTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const stemWidth = 35;
  const capWidth = 140;
  const stemFloors = Math.floor(floors * 0.6);
  const capFloors = floors - stemFloors;

  // Thin stem
  for (let floor = 0; floor < stemFloors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    blocks.push(createBlock(centerX - stemWidth / 2, y, stemWidth, blockHeight, getType()));
  }

  // Wide cap on top
  for (let floor = 0; floor < capFloors; floor++) {
    const y = groundY - (stemFloors + floor + 1) * (blockHeight + gap);
    const blocksInRow = 4;
    const blockWidth = (capWidth - gap * (blocksInRow - 1)) / blocksInRow;
    const startX = centerX - capWidth / 2;

    for (let i = 0; i < blocksInRow; i++) {
      const x = startX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
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
  // Tower is cleared if 70% of blocks are destroyed
  return remaining <= initialCount * 0.3;
}
