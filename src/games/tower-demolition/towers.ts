import { Block, BlockType, Tower } from './types';
import { initBlockPhysics } from './physics';

let blockIdCounter = 0;

function createBlock(
  x: number,
  y: number,
  width: number,
  height: number,
  type: BlockType
): Block {
  const block: Block = {
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
    // Physics properties - will be initialized
    mass: 0,
    momentOfInertia: 0,
    torque: 0,
    isSupported: true,
    isTipping: false,
    supportInfo: null,
    isSliding: false,
    staticFrictionExceeded: false,
  };

  // Initialize physics properties based on size and type
  initBlockPhysics(block);

  return block;
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

  // Fun wobbly tower patterns - now including beam structures!
  const patterns = [
    buildTallTower,
    buildTopHeavyTower,
    buildWobblyStack,
    buildTwinTowers,
    buildInvertedTower,
    buildPrecariousPile,
    buildSkyscraper,
    buildMushroomTower,
    // New beam-based structures
    buildBalancingBeam,
    buildSeesawTower,
    buildBridgeStructure,
    buildCantilever,
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

  // Precarious bridge beam at top
  const bridgeY = groundY - floors * (blockHeight + gap);
  const bridgeWidth = towerGap + towerWidth * 2;
  blocks.push(createBlock(centerX - bridgeWidth / 2, bridgeY, bridgeWidth, blockHeight * 0.7, BlockType.Beam));
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

// === NEW BEAM-BASED STRUCTURES ===

// A long beam balanced on a fulcrum with blocks on each end
function buildBalancingBeam(
  blocks: Block[],
  centerX: number,
  groundY: number,
  _floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const fulcrumHeight = blockHeight * 3;
  const fulcrumWidth = 25;
  const beamWidth = 180;
  const beamHeight = blockHeight * 0.6;

  // Fulcrum (small triangular-ish support)
  blocks.push(createBlock(
    centerX - fulcrumWidth / 2,
    groundY - fulcrumHeight,
    fulcrumWidth,
    fulcrumHeight,
    BlockType.Stone
  ));

  // Long balancing beam on top
  blocks.push(createBlock(
    centerX - beamWidth / 2,
    groundY - fulcrumHeight - beamHeight - 2,
    beamWidth,
    beamHeight,
    BlockType.Beam
  ));

  // Blocks on left side of beam
  const leftX = centerX - beamWidth / 2 + 10;
  for (let i = 0; i < 2; i++) {
    blocks.push(createBlock(
      leftX,
      groundY - fulcrumHeight - beamHeight - (i + 2) * (blockHeight + gap),
      35,
      blockHeight,
      getType()
    ));
  }

  // Blocks on right side of beam
  const rightX = centerX + beamWidth / 2 - 45;
  for (let i = 0; i < 3; i++) {
    blocks.push(createBlock(
      rightX,
      groundY - fulcrumHeight - beamHeight - (i + 2) * (blockHeight + gap),
      35,
      blockHeight,
      getType()
    ));
  }
}

// Seesaw with tower on one side
function buildSeesawTower(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const fulcrumHeight = blockHeight * 2;
  const fulcrumWidth = 30;
  const beamWidth = 160;
  const beamHeight = blockHeight * 0.5;

  // Fulcrum
  blocks.push(createBlock(
    centerX - fulcrumWidth / 2,
    groundY - fulcrumHeight,
    fulcrumWidth,
    fulcrumHeight,
    BlockType.Steel
  ));

  // Seesaw beam
  blocks.push(createBlock(
    centerX - beamWidth / 2,
    groundY - fulcrumHeight - beamHeight - 2,
    beamWidth,
    beamHeight,
    BlockType.Beam
  ));

  // Tower on left side
  const towerX = centerX - beamWidth / 2 + 5;
  const towerWidth = 40;
  const towerFloors = Math.min(floors, 5);

  for (let floor = 0; floor < towerFloors; floor++) {
    const y = groundY - fulcrumHeight - beamHeight - (floor + 2) * (blockHeight + gap);
    blocks.push(createBlock(towerX, y, towerWidth, blockHeight, getType()));
  }

  // Single heavy block on right side (counterweight)
  blocks.push(createBlock(
    centerX + beamWidth / 2 - 50,
    groundY - fulcrumHeight - beamHeight - blockHeight - gap - 2,
    45,
    blockHeight * 1.5,
    BlockType.Steel
  ));
}

// Bridge spanning two pillars
function buildBridgeStructure(
  blocks: Block[],
  centerX: number,
  groundY: number,
  floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const pillarWidth = 35;
  const pillarHeight = blockHeight * 4;
  const bridgeSpan = 120;
  const bridgeHeight = blockHeight * 0.6;

  // Left pillar
  const leftPillarX = centerX - bridgeSpan / 2 - pillarWidth / 2;
  for (let i = 0; i < 2; i++) {
    blocks.push(createBlock(
      leftPillarX,
      groundY - (i + 1) * pillarHeight / 2,
      pillarWidth,
      pillarHeight / 2,
      BlockType.Stone
    ));
  }

  // Right pillar
  const rightPillarX = centerX + bridgeSpan / 2 - pillarWidth / 2;
  for (let i = 0; i < 2; i++) {
    blocks.push(createBlock(
      rightPillarX,
      groundY - (i + 1) * pillarHeight / 2,
      pillarWidth,
      pillarHeight / 2,
      BlockType.Stone
    ));
  }

  // Bridge beam spanning the pillars
  const bridgeWidth = bridgeSpan + pillarWidth;
  blocks.push(createBlock(
    centerX - bridgeWidth / 2,
    groundY - pillarHeight - bridgeHeight - 2,
    bridgeWidth,
    bridgeHeight,
    BlockType.Beam
  ));

  // Tower on top of bridge
  const towerWidth = 50;
  const towerFloors = Math.min(floors - 2, 4);
  for (let floor = 0; floor < towerFloors; floor++) {
    const y = groundY - pillarHeight - bridgeHeight - (floor + 2) * (blockHeight + gap);
    blocks.push(createBlock(centerX - towerWidth / 2, y, towerWidth, blockHeight, getType()));
  }
}

// Cantilever - beam extending out from a weighted base
function buildCantilever(
  blocks: Block[],
  centerX: number,
  groundY: number,
  _floors: number,
  blockHeight: number,
  gap: number,
  getType: () => BlockType
): void {
  const baseWidth = 60;
  const baseFloors = 3;
  const beamLength = 120;
  const beamHeight = blockHeight * 0.7;

  // Heavy base (anchor)
  const baseX = centerX - 40;
  for (let floor = 0; floor < baseFloors; floor++) {
    const y = groundY - (floor + 1) * (blockHeight + gap);
    blocks.push(createBlock(baseX, y, baseWidth, blockHeight, BlockType.Steel));
  }

  // Cantilever beam extending to the right
  const beamY = groundY - baseFloors * (blockHeight + gap) - beamHeight - 2;
  blocks.push(createBlock(
    baseX,
    beamY,
    beamLength,
    beamHeight,
    BlockType.Beam
  ));

  // Blocks stacked on the extending part of the beam
  const stackX = baseX + beamLength - 40;
  for (let i = 0; i < 3; i++) {
    blocks.push(createBlock(
      stackX,
      beamY - (i + 1) * (blockHeight + gap),
      35,
      blockHeight,
      getType()
    ));
  }

  // More weight on top of base to anchor
  blocks.push(createBlock(
    baseX + 5,
    beamY - blockHeight - gap,
    baseWidth - 10,
    blockHeight,
    BlockType.Stone
  ));
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
