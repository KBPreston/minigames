import { Brick, BrickType, BallType, Level, HP_COLORS, INDESTRUCTIBLE_COLOR, SHIELD_COLOR, BOMB_COLOR, QueuedBall } from './types';

const GRID_COLS = 8;
const BASE_ROWS = 4;
const CEILING_GAP = 40; // Gap at top for ball maneuvering

export interface LevelConfig {
  gridOffsetX: number;
  gridOffsetY: number;
  brickWidth: number;
  brickHeight: number;
  brickGap: number;
}

function getBrickColor(type: BrickType, hp: number): string {
  if (type === BrickType.Indestructible) {
    return INDESTRUCTIBLE_COLOR;
  }
  if (type === BrickType.Shield) {
    return SHIELD_COLOR;
  }
  if (type === BrickType.Bomb) {
    return BOMB_COLOR;
  }
  // Color based on current HP - higher HP = warmer/redder color
  const colorIndex = Math.min(hp - 1, HP_COLORS.length - 1);
  return HP_COLORS[colorIndex];
}

// Create corridor patterns - certain columns have more gaps for ball paths
function getCorridorColumns(): Set<number> {
  const corridors = new Set<number>();
  // Always have at least 2 corridor columns
  const numCorridors = 2 + Math.floor(Math.random() * 2);

  // Prefer middle columns for corridors early on, spread out later
  const possibleCols = [1, 2, 3, 4, 5, 6];
  for (let i = 0; i < numCorridors && possibleCols.length > 0; i++) {
    const idx = Math.floor(Math.random() * possibleCols.length);
    corridors.add(possibleCols[idx]);
    possibleCols.splice(idx, 1);
  }

  return corridors;
}

export function generateLevel(levelNum: number, config: LevelConfig): Level {
  const bricks: Brick[] = [];
  const { gridOffsetX, gridOffsetY, brickWidth, brickHeight, brickGap } = config;

  // Add ceiling gap so balls can maneuver at the top
  const effectiveGridOffsetY = gridOffsetY + CEILING_GAP;

  // Row count increases slowly: 4 rows at start, +1 row every 3 levels, max 7
  const rows = Math.min(BASE_ROWS + Math.floor((levelNum - 1) / 3), 7);

  // Difficulty scaling - fun from the start!
  // Strong bricks: 10% base chance, increases with level
  const strongChance = Math.min(0.10 + (levelNum - 1) * 0.04, 0.35);

  // Indestructible: 5% base chance from level 1, slowly increases
  const indestructibleChance = Math.min(0.05 + (levelNum - 1) * 0.015, 0.12);

  // Bomb bricks: 5% base chance, increases slowly - keeps them special
  const bombChance = Math.min(0.05 + (levelNum - 1) * 0.01, 0.10);

  // Strong brick HP: starts at 2, increases every 4 levels
  const maxStrongHp = Math.min(2 + Math.floor(levelNum / 4), 4);

  // Get corridor columns for this level
  const corridors = getCorridorColumns();

  for (let row = 0; row < rows; row++) {
    // Row position factor: 0 = top row, 1 = bottom row
    const rowFactor = row / (rows - 1 || 1);

    for (let col = 0; col < GRID_COLS; col++) {
      // Calculate gap chance based on multiple factors
      let gapChance = 0.20; // Base 20% gap chance

      // Bottom rows have more gaps (entry points for balls)
      gapChance += rowFactor * 0.15;

      // Corridor columns have high gap chance
      if (corridors.has(col)) {
        gapChance += 0.35;
      }

      // Edge columns slightly more likely to have gaps
      if (col === 0 || col === GRID_COLS - 1) {
        gapChance += 0.1;
      }

      // Earlier levels are less dense
      if (levelNum <= 2) {
        gapChance += 0.1;
      }

      if (Math.random() < gapChance) continue;

      // Determine brick type
      let type: BrickType;
      let hp: number;
      let maxHp: number;

      const rand = Math.random();

      // Indestructible bricks prefer non-corridor positions and upper rows
      const indestructibleBonus = corridors.has(col) ? -0.05 : (1 - rowFactor) * 0.03;
      const effectiveIndestructibleChance = Math.max(0, indestructibleChance + indestructibleBonus);

      if (rand < effectiveIndestructibleChance) {
        type = BrickType.Indestructible;
        hp = 1;
        maxHp = 1;
      } else if (rand < effectiveIndestructibleChance + bombChance) {
        // Bomb brick - always 1 HP
        type = BrickType.Bomb;
        hp = 1;
        maxHp = 1;
      } else if (rand < effectiveIndestructibleChance + bombChance + strongChance) {
        type = BrickType.Strong;
        // HP weighted toward lower values
        const hpRoll = Math.random();
        if (hpRoll < 0.5) {
          maxHp = 2;
        } else if (hpRoll < 0.8) {
          maxHp = Math.min(3, maxStrongHp);
        } else {
          maxHp = maxStrongHp;
        }
        hp = maxHp;
      } else {
        type = BrickType.Normal;
        hp = 1;
        maxHp = 1;
      }

      const x = gridOffsetX + col * (brickWidth + brickGap);
      const y = effectiveGridOffsetY + row * (brickHeight + brickGap);

      bricks.push({
        x,
        y,
        width: brickWidth,
        height: brickHeight,
        hp,
        maxHp,
        type,
        color: getBrickColor(type, hp),
      });
    }
  }

  // Ensure we don't have an impossible level (all indestructible)
  const destructibleCount = bricks.filter(b =>
    b.type !== BrickType.Indestructible && b.type !== BrickType.Shield
  ).length;
  if (destructibleCount === 0 && bricks.length > 0) {
    // Convert some indestructible to normal
    const toConvert = bricks.filter(b => b.type === BrickType.Indestructible).slice(0, 5);
    for (const brick of toConvert) {
      brick.type = BrickType.Normal;
      brick.hp = 1;
      brick.maxHp = 1;
      brick.color = getBrickColor(brick.type, brick.hp);
    }
  }

  // Generate ball queue
  const ballQueue = generateBallQueue(levelNum);

  return { bricks, ballQueue };
}

// Generate a queue of balls with occasional power-ups
export function generateBallQueue(levelNum: number): QueuedBall[] {
  // Ball count: start with 5, gain 1 every 3 levels, max 7
  const count = Math.min(5 + Math.floor((levelNum - 1) / 3), 7);

  // Triple shot chance: 15% base from level 1, increases slowly
  const tripleShotChance = Math.min(0.15 + (levelNum - 1) * 0.05, 0.30);

  const queue: QueuedBall[] = [];
  let lastWasSpecial = false;

  for (let i = 0; i < count; i++) {
    // Don't allow consecutive special balls
    if (!lastWasSpecial && Math.random() < tripleShotChance) {
      queue.push({ type: BallType.TripleShot });
      lastWasSpecial = true;
    } else {
      queue.push({ type: BallType.Normal });
      lastWasSpecial = false;
    }
  }

  // Guarantee at least one triple shot from level 1
  if (!queue.some(b => b.type === BallType.TripleShot)) {
    const idx = Math.floor(Math.random() * Math.min(3, queue.length));
    queue[idx] = { type: BallType.TripleShot };
  }

  return queue;
}

export function updateBrickColor(brick: Brick): void {
  brick.color = getBrickColor(brick.type, brick.hp);
}

export function getDestructibleCount(bricks: Brick[]): number {
  return bricks.filter(b => b.type !== BrickType.Indestructible).length;
}

export function isLevelCleared(bricks: Brick[]): boolean {
  // Shields and indestructible don't count toward clearing
  return bricks.every(b =>
    b.type === BrickType.Indestructible ||
    b.type === BrickType.Shield ||
    b.hp <= 0
  );
}
