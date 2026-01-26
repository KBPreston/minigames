import type { GameAPI, GameInstance } from '../../core/types';
import {
  Particle,
  FloatingText,
  DefeatAnimation,
  generateParticlesAt,
  createFloatingText,
  getColorFloodWord,
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

const GRID_SIZE = 10;
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'];
const TARGET_SIZE = 6;
const MOVES_PER_ROUND = 25;

type Grid = number[][];

export class ColorFloodGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private grid: Grid = [];
  private score: number = 0;
  private movesLeft: number = MOVES_PER_ROUND;
  private round: number = 1;
  private currentColor: number = 0;
  private cellSize: number = 0;
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;
  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private animationFrame: number = 0;
  private defeatAnimation: DefeatAnimation | null = null;

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

    const padding = 16;
    const availableHeight = rect.height - 180;
    const size = Math.min(rect.width - padding * 2, availableHeight);
    this.cellSize = Math.floor(size / GRID_SIZE);
    const gridSize = this.cellSize * GRID_SIZE;

    this.gridOffsetX = (rect.width - gridSize) / 2;
    this.gridOffsetY = padding + 50;

    this.render();
  };

  private handleClick = (e: MouseEvent) => {
    if (this.isPaused || this.movesLeft <= 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const buttonY = this.gridOffsetY + this.cellSize * GRID_SIZE + 30;
    if (y > buttonY - 25 && y < buttonY + 35) {
      const buttonWidth = 50;
      const totalWidth = COLORS.length * buttonWidth + (COLORS.length - 1) * 10;
      const startX = (rect.width - totalWidth) / 2;
      const x = e.clientX - rect.left;

      for (let i = 0; i < COLORS.length; i++) {
        const bx = startX + i * (buttonWidth + 10);
        if (x >= bx && x <= bx + buttonWidth) {
          if (i !== this.currentColor) {
            this.flood(i);
          }
          return;
        }
      }
    }
  };

  private flood(newColor: number) {
    const oldColor = this.currentColor;
    if (newColor === oldColor) return;

    const visited = new Set<string>();
    const toFill: [number, number][] = [[0, 0]];
    const connected: [number, number][] = [];

    while (toFill.length > 0) {
      const [r, c] = toFill.pop()!;
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      if (this.grid[r][c] !== oldColor) continue;

      visited.add(key);
      connected.push([r, c]);
      toFill.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }

    for (const [r, c] of connected) {
      this.grid[r][c] = newColor;
    }

    this.currentColor = newColor;
    this.movesLeft--;
    this.api.haptics.tap();
    this.api.sounds.flood();

    // Warning sound when low on moves
    if (this.movesLeft === 5) {
      this.api.sounds.warning();
    }

    this.checkAndClearGroups();
    this.render();

    // Start effects animation if needed
    if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animateEffects();
    }

    // Check win condition - board filled
    if (this.isAllSameColor()) {
      const bonus = 500 + this.movesLeft * 20;
      this.score += bonus;
      this.api.setScore(this.score);
      this.api.haptics.success();
      this.api.sounds.roundComplete();

      // Add celebration effects for winning
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = this.gridOffsetY + this.cellSize * GRID_SIZE / 2;

      // Particles across the board
      for (let i = 0; i < 5; i++) {
        const x = this.gridOffsetX + Math.random() * this.cellSize * GRID_SIZE;
        const y = this.gridOffsetY + Math.random() * this.cellSize * GRID_SIZE;
        this.particles.push(...generateParticlesAt(x, y, COLORS[this.currentColor], 6));
      }

      // Floating text for bonus
      this.floatingTexts.push(createFloatingText(centerX, centerY - 40, `+${bonus}`, '#fbbf24', 28));
      this.floatingTexts.push(createFloatingText(centerX, centerY - 80, 'ROUND CLEAR!', '#34d399', 32));

      // Next round after a delay
      setTimeout(() => {
        this.round++;
        this.movesLeft = MOVES_PER_ROUND;
        this.initGrid();
        this.render();
      }, 1500);
      return;
    }

    // Check lose condition - out of moves
    if (this.movesLeft <= 0) {
      this.triggerDefeat();
    }
  }

  private triggerDefeat() {
    this.defeatAnimation = createDefeatAnimation();

    // Generate particles from all cells
    const cells: { x: number; y: number; color: string }[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        cells.push({
          x: this.gridOffsetX + c * this.cellSize + this.cellSize / 2,
          y: this.gridOffsetY + r * this.cellSize + this.cellSize / 2,
          color: COLORS[this.grid[r][c]],
        });
      }
    }
    this.particles.push(...generateDefeatParticles(cells));

    this.animateEffects();
  }

  private animateEffects = () => {
    if (this.isDestroyed || this.isPaused) return;

    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);

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

  private checkAndClearGroups(): number {
    const visited = new Set<string>();
    let groupsCleared = 0;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const key = `${r},${c}`;
        if (visited.has(key)) continue;

        const colorIndex = this.grid[r][c];
        const group: [number, number][] = [];
        const stack: [number, number][] = [[r, c]];

        while (stack.length > 0) {
          const [gr, gc] = stack.pop()!;
          const gkey = `${gr},${gc}`;
          if (visited.has(gkey)) continue;
          if (gr < 0 || gr >= GRID_SIZE || gc < 0 || gc >= GRID_SIZE) continue;
          if (this.grid[gr][gc] !== colorIndex) continue;

          visited.add(gkey);
          group.push([gr, gc]);
          stack.push([gr - 1, gc], [gr + 1, gc], [gr, gc - 1], [gr, gc + 1]);
        }

        if (group.length === TARGET_SIZE) {
          const color = COLORS[colorIndex];

          // Calculate center for effects
          let sumX = 0, sumY = 0;
          for (const [gr, gc] of group) {
            sumX += this.gridOffsetX + gc * this.cellSize + this.cellSize / 2;
            sumY += this.gridOffsetY + gr * this.cellSize + this.cellSize / 2;
            // Generate particles for each cell
            const x = this.gridOffsetX + gc * this.cellSize + this.cellSize / 2;
            const y = this.gridOffsetY + gr * this.cellSize + this.cellSize / 2;
            this.particles.push(...generateParticlesAt(x, y, color, 4));
          }

          const centerX = sumX / group.length;
          const centerY = sumY / group.length;

          // Add floating text for points
          this.floatingTexts.push(createFloatingText(centerX, centerY - 10, '+100', '#fbbf24', 18));

          for (const [gr, gc] of group) {
            this.grid[gr][gc] = Math.floor(Math.random() * COLORS.length);
          }
          this.score += 100;
          groupsCleared++;
        }
      }
    }

    if (groupsCleared > 0) {
      this.api.setScore(this.score);
      this.api.haptics.success();
      this.api.sounds.regionClear();
      if (groupsCleared > 1) {
        this.api.sounds.combo(groupsCleared);
      }

      // Add celebratory word if multiple groups cleared
      if (groupsCleared >= 1) {
        const { word, color } = getColorFloodWord(groupsCleared);
        const rect = this.container.getBoundingClientRect();
        this.floatingTexts.push(
          createFloatingText(rect.width / 2, this.gridOffsetY + this.cellSize * GRID_SIZE / 2 - 30, word, color, groupsCleared >= 2 ? 26 : 20)
        );
      }
    }

    return groupsCleared;
  }

  private isAllSameColor(): boolean {
    const first = this.grid[0][0];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.grid[r][c] !== first) return false;
      }
    }
    return true;
  }

  private initGrid() {
    this.grid = Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => Math.floor(Math.random() * COLORS.length))
    );
    this.currentColor = this.grid[0][0];
  }

  private render() {
    if (this.isDestroyed || this.grid.length === 0) return;
    const rect = this.container.getBoundingClientRect();
    const { ctx, cellSize } = this;

    // Apply shake offset during defeat
    const shake = getShakeOffset(this.defeatAnimation);
    const gridOffsetX = this.gridOffsetX + shake.x;
    const gridOffsetY = this.gridOffsetY + shake.y;

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Header - round and moves
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Round ${this.round}`, rect.width / 2, 25);

    ctx.fillStyle = this.movesLeft <= 5 ? '#ef4444' : '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Moves left: ${this.movesLeft}`, rect.width / 2, 45);

    // Draw grid
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const x = gridOffsetX + c * cellSize;
        const y = gridOffsetY + r * cellSize;

        ctx.fillStyle = COLORS[this.grid[r][c]];
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }
    }

    // Highlight connected region
    const connected = this.getConnectedFromOrigin();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (const [r, c] of connected) {
      ctx.strokeRect(gridOffsetX + c * cellSize + 2, gridOffsetY + r * cellSize + 2, cellSize - 4, cellSize - 4);
    }

    // Color buttons
    const buttonY = this.gridOffsetY + cellSize * GRID_SIZE + 30;
    const buttonWidth = 50;
    const buttonHeight = 40;
    const totalWidth = COLORS.length * buttonWidth + (COLORS.length - 1) * 10;
    const startX = (rect.width - totalWidth) / 2;

    for (let i = 0; i < COLORS.length; i++) {
      const bx = startX + i * (buttonWidth + 10);

      ctx.fillStyle = COLORS[i];
      ctx.beginPath();
      ctx.roundRect(bx, buttonY, buttonWidth, buttonHeight, 8);
      ctx.fill();

      if (i === this.currentColor) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Instructions
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Groups of ${TARGET_SIZE}: +100 | Fill board: +500 + move bonus`, rect.width / 2, buttonY + buttonHeight + 25);

    // Draw effects
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(ctx, this.particles, reduceMotion);
    drawFloatingTexts(ctx, this.floatingTexts, reduceMotion);

    // Draw defeat overlay
    drawDefeatOverlay(ctx, rect.width, rect.height, this.defeatAnimation);
  }

  private getConnectedFromOrigin(): [number, number][] {
    const color = this.grid[0][0];
    const visited = new Set<string>();
    const result: [number, number][] = [];
    const stack: [number, number][] = [[0, 0]];

    while (stack.length > 0) {
      const [r, c] = stack.pop()!;
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      if (this.grid[r][c] !== color) continue;

      visited.add(key);
      result.push([r, c]);
      stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }
    return result;
  }

  start() {
    this.initGrid();
    this.score = 0;
    this.movesLeft = MOVES_PER_ROUND;
    this.round = 1;
    this.particles = [];
    this.floatingTexts = [];
    this.defeatAnimation = null;
    this.isPaused = false;
    this.api.setScore(0);
    this.api.sounds.gameStart();
    this.render();
  }

  pause() {
    this.isPaused = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  resume() {
    this.isPaused = false;
    this.render();
    if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animateEffects();
    }
  }

  reset() { this.start(); }

  destroy() {
    this.isDestroyed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.remove();
  }
}
