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

  // Tower parameters scale with level - bigger and more complex
  const baseWidth = Math.min(160 + level * 8, 280); // Wider towers
  const floors = Math.min(5 + Math.floor(level / 2), 14); // More floors
  const blockHeight = 22;
  const blockGap = 2;

  // Determine block types based on level
  const stoneChance = Math.min(0.1 + level * 0.04, 0.35);
  const steelChance = level >= 2 ? Math.min((level - 1) * 0.025, 0.12) : 0;

  function getBlockType(): BlockType {
    const rand = Math.random();
    if (rand < steelChance) return BlockType.Steel;
    if (rand < steelChance + stoneChance) return BlockType.Stone;
    return BlockType.Wood;
  }

  // More tower patterns - cycle through them
  const patterns = [
    buildSimpleTower,
    buildPyramidTower,
    buildWindowTower,
    buildDoubleTower,
    buildAlternatingTower,
    buildCastleTower,
    buildArchTower,
    buildChaosStack,
    buildBridgeTower,
    buildZigzagTower,
  ];

  const pattern = patterns[level % patterns.length];
  pattern(blocks, centerX, groundY, baseWidth, floors, blockHeight, blockGap, getBlockType);

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
  const blocksPerRow = 4;
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
  const maxBlocksInRow = 5;

  for (let floor = 0; floor < floors; floor++) {
    const blocksInRow = Math.max(maxBlocksInRow - floor, 1);
    const rowWidth = baseWidth * (blocksInRow / maxBlocksInRow);
    const blockWidth = (rowWidth - gap * Math.max(blocksInRow - 1, 0)) / blocksInRow;
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
  const blocksPerRow = 5;
  const blockWidth = (baseWidth - gap * (blocksPerRow - 1)) / blocksPerRow;
  const startX = centerX - baseWidth / 2;

  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    for (let i = 0; i < blocksPerRow; i++) {
      // Create windows by skipping blocks in a checkerboard pattern
      if (floor % 2 === 1 && (i === 1 || i === 3)) continue;

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

  const leftStartX = centerX - towerGap / 2 - towerWidth;
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
    if (floor > 0 && floor % 2 === 0) {
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
      const blocksPerRow = 4;
      const blockWidth = (baseWidth - gap * (blocksPerRow - 1)) / blocksPerRow;
      const startX = centerX - baseWidth / 2;

      for (let i = 0; i < blocksPerRow; i++) {
        const x = startX + i * (blockWidth + gap);
        blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
      }
    } else {
      const narrowWidth = baseWidth * 0.55;
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

// Castle with turrets on sides
function buildCastleTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const mainWidth = baseWidth * 0.5;
  const turretWidth = baseWidth * 0.2;
  const blocksPerRow = 3;
  const blockWidth = (mainWidth - gap * (blocksPerRow - 1)) / blocksPerRow;

  // Main tower
  const mainFloors = floors;
  const mainStartX = centerX - mainWidth / 2;

  for (let floor = 0; floor < mainFloors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    for (let i = 0; i < blocksPerRow; i++) {
      const x = mainStartX + i * (blockWidth + gap);
      blocks.push(createBlock(x, y, blockWidth, blockHeight, getType()));
    }
  }

  // Left turret (taller and thinner)
  const turretFloors = floors + 3;
  const leftTurretX = centerX - mainWidth / 2 - turretWidth - gap * 2;

  for (let floor = 0; floor < turretFloors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    blocks.push(createBlock(leftTurretX, y, turretWidth, blockHeight, getType()));
  }

  // Right turret
  const rightTurretX = centerX + mainWidth / 2 + gap * 2;

  for (let floor = 0; floor < turretFloors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    blocks.push(createBlock(rightTurretX, y, turretWidth, blockHeight, getType()));
  }

  // Battlements on top of main tower
  const battlementY = groundY - (mainFloors + 1) * (blockHeight + gap);
  blocks.push(createBlock(mainStartX, battlementY, blockWidth, blockHeight, BlockType.Stone));
  blocks.push(createBlock(mainStartX + 2 * (blockWidth + gap), battlementY, blockWidth, blockHeight, BlockType.Stone));
}

// Arch structure
function buildArchTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const pillarWidth = baseWidth * 0.25;
  const archGap = baseWidth * 0.5;
  const pillarFloors = Math.floor(floors * 0.6);

  // Left pillar
  const leftPillarX = centerX - archGap / 2 - pillarWidth;
  for (let floor = 0; floor < pillarFloors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    blocks.push(createBlock(leftPillarX, y, pillarWidth, blockHeight, getType()));
  }

  // Right pillar
  const rightPillarX = centerX + archGap / 2;
  for (let floor = 0; floor < pillarFloors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    blocks.push(createBlock(rightPillarX, y, pillarWidth, blockHeight, getType()));
  }

  // Arch top - keystone blocks
  const archY = groundY - (pillarFloors + 1) * (blockHeight + gap);
  const archWidth = baseWidth;
  const archBlockWidth = archWidth / 5;
  const archStartX = centerX - archWidth / 2;

  for (let i = 0; i < 5; i++) {
    const x = archStartX + i * archBlockWidth;
    blocks.push(createBlock(x, archY, archBlockWidth - gap, blockHeight, BlockType.Stone));
  }

  // Stack on top of arch
  const topFloors = floors - pillarFloors - 1;
  const topWidth = baseWidth * 0.7;
  const topBlockWidth = topWidth / 3;
  const topStartX = centerX - topWidth / 2;

  for (let floor = 0; floor < topFloors; floor++) {
    const y = archY - (floor + 1) * (blockHeight + gap);
    for (let i = 0; i < 3; i++) {
      const x = topStartX + i * topBlockWidth;
      blocks.push(createBlock(x, y, topBlockWidth - gap, blockHeight, getType()));
    }
  }
}

// Chaotic pile of blocks
function buildChaosStack(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const totalBlocks = floors * 4;

  for (let i = 0; i < totalBlocks; i++) {
    // Random width blocks
    const width = 25 + Math.random() * 50;
    const height = blockHeight * (0.7 + Math.random() * 0.6);

    // Stack them somewhat randomly but generally upward
    const layer = Math.floor(i / 4);
    const x = centerX - baseWidth / 2 + Math.random() * (baseWidth - width);
    const y = groundY - (layer + 1) * (blockHeight + gap) - Math.random() * 10;

    blocks.push(createBlock(x, y, width, height, getType()));
  }
}

// Bridge structure with supports
function buildBridgeTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const supportWidth = baseWidth * 0.15;
  const deckHeight = Math.floor(floors * 0.4);

  // Three support pillars
  const positions = [-0.4, 0, 0.4];

  for (const pos of positions) {
    const pillarX = centerX + baseWidth * pos - supportWidth / 2;
    const pillarFloors = pos === 0 ? deckHeight + 2 : deckHeight;

    for (let floor = 0; floor < pillarFloors; floor++) {
      const y = groundY - (floor + 1) * (blockHeight + gap);
      blocks.push(createBlock(pillarX, y, supportWidth, blockHeight,
        floor < 2 ? BlockType.Stone : getType()));
    }
  }

  // Bridge deck
  const deckY = groundY - deckHeight * (blockHeight + gap);
  const deckBlockWidth = baseWidth / 6;
  const deckStartX = centerX - baseWidth / 2;

  for (let i = 0; i < 6; i++) {
    const x = deckStartX + i * deckBlockWidth;
    blocks.push(createBlock(x, deckY, deckBlockWidth - gap, blockHeight, BlockType.Steel));
  }

  // Tower on middle support
  const towerFloors = floors - deckHeight - 2;
  const towerWidth = supportWidth * 2;
  const towerX = centerX - towerWidth / 2;

  for (let floor = 0; floor < towerFloors; floor++) {
    const y = groundY - (deckHeight + 3 + floor) * (blockHeight + gap);
    blocks.push(createBlock(towerX, y, towerWidth, blockHeight, getType()));
  }
}

// Zigzag/staircase tower
function buildZigzagTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  baseWidth: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const blockWidth = baseWidth / 4;
  const offset = baseWidth * 0.15;

  for (let floor = 0; floor < floors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);

    // Zigzag offset based on floor
    const zigzagOffset = (floor % 4 < 2) ? -offset : offset;
    const rowCenterX = centerX + zigzagOffset;

    // Place 2-3 blocks per row
    const blocksInRow = 3;
    const rowWidth = blocksInRow * blockWidth;
    const startX = rowCenterX - rowWidth / 2;

    for (let i = 0; i < blocksInRow; i++) {
      const x = startX + i * blockWidth;
      blocks.push(createBlock(x, y, blockWidth - gap, blockHeight, getType()));
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
