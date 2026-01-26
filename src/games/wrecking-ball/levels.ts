import { Brick, BrickType, Level, BRICK_COLORS } from './types';

const GRID_COLS = 8;
const GRID_ROWS = 5;

export interface LevelConfig {
  gridOffsetX: number;
  gridOffsetY: number;
  brickWidth: number;
  brickHeight: number;
  brickGap: number;
}

function getBrickColor(type: BrickType, hp: number, maxHp: number): string {
  const colors = BRICK_COLORS[type];
  if (type === BrickType.Indestructible || type === BrickType.Normal) {
    return colors[0];
  }
  // For strong bricks, color based on remaining HP
  const index = Math.min(maxHp - hp, colors.length - 1);
  return colors[index];
}

export function generateLevel(levelNum: number, config: LevelConfig): Level {
  const bricks: Brick[] = [];
  const { gridOffsetX, gridOffsetY, brickWidth, brickHeight, brickGap } = config;

  // Progressive difficulty
  const strongChance = Math.min(0.1 + levelNum * 0.05, 0.5);
  const indestructibleChance = Math.min(levelNum * 0.02, 0.15);
  const maxStrongHp = Math.min(2 + Math.floor(levelNum / 3), 4);

  // Calculate rows for this level (increases over time)
  const rows = Math.min(GRID_ROWS + Math.floor(levelNum / 5), 8);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      // Leave some gaps for ball paths (more gaps at higher rows)
      const gapChance = 0.15 + (row / rows) * 0.1;
      if (Math.random() < gapChance) continue;

      let type: BrickType;
      let hp: number;
      let maxHp: number;

      const rand = Math.random();
      if (rand < indestructibleChance) {
        type = BrickType.Indestructible;
        hp = 1;
        maxHp = 1;
      } else if (rand < indestructibleChance + strongChance) {
        type = BrickType.Strong;
        maxHp = Math.ceil(Math.random() * maxStrongHp);
        hp = maxHp;
      } else {
        type = BrickType.Normal;
        hp = 1;
        maxHp = 1;
      }

      const x = gridOffsetX + col * (brickWidth + brickGap);
      const y = gridOffsetY + row * (brickHeight + brickGap);

      bricks.push({
        x,
        y,
        width: brickWidth,
        height: brickHeight,
        hp,
        maxHp,
        type,
        color: getBrickColor(type, hp, maxHp),
      });
    }
  }

  // Ball count: starts at 3, increases slightly
  const ballCount = Math.min(3 + Math.floor(levelNum / 2), 8);

  return { bricks, ballCount };
}

export function updateBrickColor(brick: Brick): void {
  brick.color = getBrickColor(brick.type, brick.hp, brick.maxHp);
}

export function getDestructibleCount(bricks: Brick[]): number {
  return bricks.filter(b => b.type !== BrickType.Indestructible).length;
}

export function isLevelCleared(bricks: Brick[]): boolean {
  return bricks.every(b => b.type === BrickType.Indestructible || b.hp <= 0);
}
