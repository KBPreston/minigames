import type { GameAPI, GameInstance } from '../../core/types';
import {
  Particle,
  FloatingText,
  DefeatAnimation,
  generateParticlesAt,
  createFloatingText,
  getSnapMergeWord,
  drawParticles,
  drawFloatingTexts,
  filterActiveParticles,
  filterActiveFloatingTexts,
  hasActiveEffects,
  createDefeatAnimation,
  generateDefeatParticles,
  getShakeOffset,
  drawDefeatOverlay,
  isDefeatComplete,
} from '../../core/effects';

const COLS = 5;
const ROWS = 8;

type Cell = { value: number; color: string } | null;
type Grid = Cell[][];

const VALUE_COLORS: Record<number, string> = {
  2: '#fef3c7',
  4: '#fde68a',
  8: '#fcd34d',
  16: '#fbbf24',
  32: '#f59e0b',
  64: '#d97706',
  128: '#b45309',
  256: '#92400e',
  512: '#78350f',
  1024: '#451a03',
  2048: '#7c2d12',
};

export class SnapMergeGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private grid: Grid = [];
  private score: number = 0;
  private cellWidth: number = 0;
  private cellHeight: number = 0;
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;
  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private animatingFall: { col: number; row: number; targetRow: number; progress: number } | null = null;
  private animationFrame: number = 0;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private defeatAnimation: DefeatAnimation | null = null;
  private dangerPulse: number = 0;

  constructor(container: HTMLElement, api: GameAPI) {
    this.container = container;
    this.api = api;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('click', this.handleClick);
  }

  private resize = () => {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    const padding = 20;
    const availWidth = rect.width - padding * 2;
    const availHeight = rect.height - padding * 2 - 60; // room for instructions

    this.cellWidth = Math.floor(availWidth / COLS);
    this.cellHeight = Math.floor(availHeight / ROWS);

    // Keep cells square-ish but allow slight stretch
    const minDim = Math.min(this.cellWidth, this.cellHeight);
    this.cellWidth = Math.min(this.cellWidth, minDim * 1.2);
    this.cellHeight = minDim;

    const gridWidth = this.cellWidth * COLS;
    const gridHeight = this.cellHeight * ROWS;

    this.gridOffsetX = (rect.width - gridWidth) / 2;
    this.gridOffsetY = (rect.height - gridHeight) / 2 - 20;

    this.render();
  };

  private handleClick = (e: MouseEvent) => {
    if (this.isPaused || this.animatingFall) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.gridOffsetX;
    const y = e.clientY - rect.top - this.gridOffsetY;

    const col = Math.floor(x / this.cellWidth);
    const row = Math.floor(y / this.cellHeight);

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

    const cell = this.grid[row][col];
    if (!cell) return;

    // Find where this block would fall to
    const targetRow = this.findFallTarget(row, col);

    // Check if there's a matching block directly below for immediate merge
    const blockBelow = row < ROWS - 1 ? this.grid[row + 1][col] : null;
    if (blockBelow && blockBelow.value === cell.value) {
      // Immediate merge with block below - animate a short drop
      this.animatingFall = { col, row, targetRow: row, progress: 0 };
      this.animateFall();
      return;
    }

    if (targetRow === row) {
      // Can't move and can't merge, just tap feedback
      this.api.haptics.tap();
      return;
    }

    // Start fall animation
    this.animatingFall = { col, row, targetRow, progress: 0 };
    this.animateFall();
  };

  private findFallTarget(row: number, col: number): number {
    // Look for where this block would land
    for (let r = row + 1; r < ROWS; r++) {
      if (this.grid[r][col] !== null) {
        // Found a block - stop just above it
        return r - 1;
      }
    }
    // Fall to bottom
    return ROWS - 1;
  }

  private animateFall = () => {
    if (!this.animatingFall || this.isDestroyed) return;

    this.animatingFall.progress += 0.15;

    if (this.animatingFall.progress >= 1) {
      // Animation complete - execute the move
      this.executeFall();
      return;
    }

    this.render();
    this.animationFrame = requestAnimationFrame(this.animateFall);
  };

  private executeFall() {
    if (!this.animatingFall) return;

    const { col, row, targetRow } = this.animatingFall;
    const cell = this.grid[row][col]!;

    this.grid[row][col] = null;

    // Check if we merge with the block below target (or directly below for immediate merge)
    const mergeRow = targetRow === row ? row + 1 : targetRow + 1;
    const blockBelow = mergeRow < ROWS ? this.grid[mergeRow][col] : null;

    if (blockBelow && blockBelow.value === cell.value) {
      // Merge!
      const newVal = cell.value * 2;
      const newColor = VALUE_COLORS[newVal] || '#7c2d12';
      this.grid[mergeRow][col] = { value: newVal, color: newColor };
      this.score += newVal;
      this.api.setScore(this.score);
      this.api.haptics.success();

      // Calculate merge position for effects
      const mergeX = this.gridOffsetX + col * this.cellWidth + this.cellWidth / 2;
      const mergeY = this.gridOffsetY + mergeRow * this.cellHeight + this.cellHeight / 2;

      // Generate particles
      this.particles.push(...generateParticlesAt(mergeX, mergeY, cell.color, 8));

      // Add floating text for points
      this.floatingTexts.push(createFloatingText(mergeX, mergeY - 20, `+${newVal}`, '#fbbf24', 20));

      // Add celebratory word for bigger merges
      const { word, color: wordColor } = getSnapMergeWord(newVal);
      if (word) {
        this.floatingTexts.push(
          createFloatingText(mergeX, mergeY - 50, word, wordColor, newVal >= 256 ? 26 : 20)
        );
      }
    } else if (targetRow !== row) {
      // Just moved down
      this.grid[targetRow][col] = cell;
      this.api.haptics.tap();
    }

    this.animatingFall = null;

    // Spawn a new block
    if (!this.spawnBlock()) {
      // Game over - trigger defeat animation
      this.triggerDefeat();
      return;
    }

    this.render();

    // Continue effect animation if needed
    if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animateEffects();
    }
  }

  private animateEffects = () => {
    if (this.isDestroyed || this.isPaused) return;

    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);
    this.dangerPulse = (this.dangerPulse + 0.05) % (Math.PI * 2);

    // Check if defeat animation is complete
    if (this.defeatAnimation && isDefeatComplete(this.defeatAnimation)) {
      this.api.gameOver(this.score);
      return;
    }

    this.render();

    if (hasActiveEffects(this.particles, this.floatingTexts) || this.defeatAnimation) {
      this.animationFrame = requestAnimationFrame(this.animateEffects);
    }
  };

  private triggerDefeat() {
    this.defeatAnimation = createDefeatAnimation();

    // Generate particles from all filled cells
    const cells: { x: number; y: number; color: string }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (cell) {
          cells.push({
            x: this.gridOffsetX + c * this.cellWidth + this.cellWidth / 2,
            y: this.gridOffsetY + r * this.cellHeight + this.cellHeight / 2,
            color: cell.color,
          });
        }
      }
    }
    this.particles.push(...generateDefeatParticles(cells));

    this.animateEffects();
  }

  private spawnBlock(): boolean {
    // Pick a random column, weighted toward columns with more space
    const columnHeights: number[] = [];
    for (let c = 0; c < COLS; c++) {
      let height = 0;
      for (let r = 0; r < ROWS; r++) {
        if (this.grid[r][c]) {
          height = ROWS - r;
          break;
        }
      }
      columnHeights.push(height);
    }

    // Find columns that have space (top row empty)
    const availableCols = [];
    for (let c = 0; c < COLS; c++) {
      if (!this.grid[0][c]) {
        availableCols.push(c);
      }
    }

    if (availableCols.length === 0) {
      return false; // No space - game over
    }

    // Prefer columns with more blocks (to create merge opportunities)
    const weights = availableCols.map(c => columnHeights[c] + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;

    let chosenCol = availableCols[0];
    for (let i = 0; i < availableCols.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        chosenCol = availableCols[i];
        break;
      }
    }

    const value = Math.random() < 0.9 ? 2 : 4;
    this.grid[0][chosenCol] = { value, color: VALUE_COLORS[value] };

    return true;
  }

  private render() {
    if (this.isDestroyed || this.grid.length === 0) return;
    const rect = this.container.getBoundingClientRect();
    const { ctx, cellWidth, cellHeight } = this;

    // Apply shake offset during defeat
    const shake = getShakeOffset(this.defeatAnimation);
    const gridOffsetX = this.gridOffsetX + shake.x;
    const gridOffsetY = this.gridOffsetY + shake.y;

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw grid background
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(
      gridOffsetX - 8,
      gridOffsetY - 8,
      cellWidth * COLS + 16,
      cellHeight * ROWS + 16,
      12
    );
    ctx.fill();

    // Draw danger zone at top with pulsing effect
    const hasDangerBlocks = this.grid[0].some(cell => cell !== null);
    const pulseIntensity = hasDangerBlocks ? 0.3 + Math.sin(this.dangerPulse) * 0.15 : 0.15;

    // Danger zone background
    ctx.fillStyle = `rgba(239, 68, 68, ${pulseIntensity})`;
    ctx.fillRect(gridOffsetX, gridOffsetY, cellWidth * COLS, cellHeight);

    // Danger zone border
    ctx.strokeStyle = `rgba(239, 68, 68, ${pulseIntensity + 0.3})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(gridOffsetX, gridOffsetY, cellWidth * COLS, cellHeight);

    // Warning stripes pattern
    ctx.save();
    ctx.beginPath();
    ctx.rect(gridOffsetX, gridOffsetY, cellWidth * COLS, cellHeight);
    ctx.clip();
    ctx.strokeStyle = `rgba(239, 68, 68, ${pulseIntensity * 0.5})`;
    ctx.lineWidth = 3;
    const stripeSpacing = 15;
    for (let i = -cellHeight; i < cellWidth * COLS + cellHeight; i += stripeSpacing) {
      ctx.beginPath();
      ctx.moveTo(gridOffsetX + i, gridOffsetY);
      ctx.lineTo(gridOffsetX + i + cellHeight, gridOffsetY + cellHeight);
      ctx.stroke();
    }
    ctx.restore();

    // Draw cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = gridOffsetX + c * cellWidth;
        const y = gridOffsetY + r * cellHeight;
        const pad = 3;

        // Empty cell background
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.roundRect(x + pad, y + pad, cellWidth - pad * 2, cellHeight - pad * 2, 6);
        ctx.fill();

        // Skip rendering the animating cell at its original position
        if (this.animatingFall && this.animatingFall.row === r && this.animatingFall.col === c) {
          continue;
        }

        const cell = this.grid[r][c];
        if (cell) {
          this.drawCell(x, y, cell, pad);
        }
      }
    }

    // Draw animating cell
    if (this.animatingFall) {
      const { col, row, targetRow, progress } = this.animatingFall;
      const cell = this.grid[row][col];
      if (cell) {
        const x = gridOffsetX + col * cellWidth;
        const startY = gridOffsetY + row * cellHeight;
        const endY = gridOffsetY + targetRow * cellHeight;
        const y = startY + (endY - startY) * this.easeOutBounce(progress);
        this.drawCell(x, y, cell, 3);
      }
    }

    // Instructions
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Tap a block to drop it down. Match values to merge!',
      rect.width / 2,
      gridOffsetY + cellHeight * ROWS + 35
    );

    // Draw effects
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(ctx, this.particles, reduceMotion);
    drawFloatingTexts(ctx, this.floatingTexts, reduceMotion);

    // Draw defeat overlay
    drawDefeatOverlay(ctx, rect.width, rect.height, this.defeatAnimation);
  }

  private drawCell(x: number, y: number, cell: { value: number; color: string }, pad: number) {
    const { ctx, cellWidth, cellHeight } = this;

    ctx.fillStyle = cell.color;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, cellWidth - pad * 2, cellHeight - pad * 2, 6);
    ctx.fill();

    // Draw value
    ctx.fillStyle = cell.value <= 4 ? '#1e293b' : '#fff';
    ctx.font = `bold ${Math.min(cellWidth, cellHeight) * 0.4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.value.toString(), x + cellWidth / 2, y + cellHeight / 2);
  }

  private easeOutBounce(t: number): number {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    } else if (t < 2 / 2.75) {
      t -= 1.5 / 2.75;
      return 7.5625 * t * t + 0.75;
    } else if (t < 2.5 / 2.75) {
      t -= 2.25 / 2.75;
      return 7.5625 * t * t + 0.9375;
    } else {
      t -= 2.625 / 2.75;
      return 7.5625 * t * t + 0.984375;
    }
  }

  start() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.score = 0;
    this.isPaused = false;
    this.animatingFall = null;
    this.particles = [];
    this.floatingTexts = [];
    this.defeatAnimation = null;
    this.dangerPulse = 0;

    // Start with some blocks scattered in lower rows
    for (let i = 0; i < 6; i++) {
      const col = Math.floor(Math.random() * COLS);
      // Place in bottom half
      for (let r = ROWS - 1; r >= ROWS / 2; r--) {
        if (!this.grid[r][col]) {
          const value = Math.random() < 0.9 ? 2 : 4;
          this.grid[r][col] = { value, color: VALUE_COLORS[value] };
          break;
        }
      }
    }

    this.api.setScore(0);
    this.render();
    this.startPulseLoop();
  }

  private startPulseLoop = () => {
    if (this.isDestroyed || this.isPaused || this.defeatAnimation) return;

    this.dangerPulse = (this.dangerPulse + 0.08) % (Math.PI * 2);

    // Only re-render if there are blocks in danger zone
    const hasDangerBlocks = this.grid[0]?.some(cell => cell !== null);
    if (hasDangerBlocks) {
      this.render();
    }

    this.animationFrame = requestAnimationFrame(this.startPulseLoop);
  };

  pause() {
    this.isPaused = true;
    cancelAnimationFrame(this.animationFrame);
  }

  resume() {
    this.isPaused = false;
    this.render();
    if (hasActiveEffects(this.particles, this.floatingTexts) || this.defeatAnimation) {
      this.animateEffects();
    } else {
      this.startPulseLoop();
    }
  }

  reset() { this.start(); }

  destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.remove();
  }
}
