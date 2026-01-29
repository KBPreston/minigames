import type { GameAPI, GameInstance } from '../../core/types';
import {
  Grid,
  Position,
  Gem,
  GRID_COLS,
  GRID_ROWS,
} from './types';
import {
  initializeGrid,
  findMatches,
  analyzeMatches,
  getSpecialGemClearPositions,
  getColorMatchPositions,
  applyGravity,
  fillEmptyCells,
  isGameOver,
  getComboWord,
  calculateMatchScore,
  createSpecialGem,
} from './logic';
import {
  drawGem,
  drawGridBackground,
  drawLineBlasterEffect,
  drawBombEffect,
  drawRainbowEffect,
} from './renderer';
import {
  Particle,
  FloatingText,
  DefeatAnimation,
  generateParticlesAt,
  createFloatingText,
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

type GameState = 'idle' | 'sliding' | 'snapping' | 'clearing' | 'falling' | 'defeat';

interface SpecialEffect {
  type: 'line_h' | 'line_v' | 'bomb' | 'rainbow';
  x: number;
  y: number;
  progress: number;
  positions?: { x: number; y: number }[];
}

interface SlideState {
  type: 'row' | 'col';
  index: number;
  offset: number; // Current pixel offset during drag
  startX: number;
  startY: number;
}

export class GemCrushGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private grid: Grid = [];
  private score: number = 0;
  private cascadeLevel: number = 1;

  private gameState: GameState = 'idle';

  // Slide state for row/column dragging
  private slideState: SlideState | null = null;
  private isDragging: boolean = false;
  private dragStartPos: { x: number; y: number } | null = null;
  private dragStartCell: Position | null = null;

  // Snap animation
  private snapProgress: number = 0;
  private snapStartTime: number = 0;
  private snapFrom: number = 0;
  private snapTo: number = 0;
  private readonly SNAP_DURATION = 150;

  private clearingPositions: Set<string> = new Set();
  private clearProgress: number = 0;
  private clearStartTime: number = 0;
  private readonly CLEAR_DURATION = 250;

  private fallingGems: { col: number; fromRow: number; toRow: number; gem: Gem }[] = [];
  private fallProgress: number = 0;
  private fallStartTime: number = 0;
  private readonly FALL_DURATION = 300;

  // Screen shake
  private screenShake: number = 0;
  private screenShakeDecay: number = 0;

  // Special effects
  private specialEffects: SpecialEffect[] = [];

  // Layout
  private cellSize: number = 0;
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;

  private isPaused: boolean = false;
  private isDestroyed: boolean = false;

  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private animationFrameId: number = 0;
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
    this.setupEventListeners();
  }

  private resize = () => {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    const padding = 16;
    const availableWidth = rect.width - padding * 2;
    const availableHeight = rect.height - padding * 2;

    this.cellSize = Math.floor(
      Math.min(availableWidth / GRID_COLS, availableHeight / GRID_ROWS)
    );
    const gridWidth = this.cellSize * GRID_COLS;
    const gridHeight = this.cellSize * GRID_ROWS;

    this.gridOffsetX = (rect.width - gridWidth) / 2;
    this.gridOffsetY = (rect.height - gridHeight) / 2;

    this.render();
  };

  private setupEventListeners() {
    this.container.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.container.addEventListener('mousedown', this.handleMouseDown);
    this.container.addEventListener('mousemove', this.handleMouseMove);
    this.container.addEventListener('mouseup', this.handleMouseUp);
    this.container.addEventListener('mouseleave', this.handleMouseUp);
  }

  private removeEventListeners() {
    this.container.removeEventListener('touchstart', this.handleTouchStart);
    this.container.removeEventListener('touchmove', this.handleTouchMove);
    this.container.removeEventListener('touchend', this.handleTouchEnd);
    this.container.removeEventListener('mousedown', this.handleMouseDown);
    this.container.removeEventListener('mousemove', this.handleMouseMove);
    this.container.removeEventListener('mouseup', this.handleMouseUp);
    this.container.removeEventListener('mouseleave', this.handleMouseUp);
  }

  private screenToGrid(screenX: number, screenY: number): Position | null {
    const rect = this.container.getBoundingClientRect();
    const x = screenX - rect.left - this.gridOffsetX;
    const y = screenY - rect.top - this.gridOffsetY;

    if (x < 0 || y < 0) return null;

    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);

    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
      return { row, col };
    }

    return null;
  }

  private handleTouchStart = (e: TouchEvent) => {
    if (this.isPaused || this.gameState !== 'idle') return;
    e.preventDefault();
    this.startDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (this.isPaused) return;
    e.preventDefault();
    this.updateDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (this.isPaused) return;
    e.preventDefault();
    this.endDrag();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isPaused || this.gameState !== 'idle') return;
    this.startDrag(e.clientX, e.clientY);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.isPaused) return;
    this.updateDrag(e.clientX, e.clientY);
  };

  private handleMouseUp = () => {
    if (this.isPaused) return;
    this.endDrag();
  };

  private startDrag(screenX: number, screenY: number) {
    const pos = this.screenToGrid(screenX, screenY);
    if (!pos) return;

    const rect = this.container.getBoundingClientRect();
    this.isDragging = true;
    this.dragStartPos = { x: screenX - rect.left, y: screenY - rect.top };
    this.dragStartCell = pos;
    this.slideState = null;

    this.api.haptics.tap();
  }

  private updateDrag(screenX: number, screenY: number) {
    if (!this.isDragging || !this.dragStartPos || !this.dragStartCell) return;
    if (this.gameState !== 'idle' && this.gameState !== 'sliding') return;

    const rect = this.container.getBoundingClientRect();
    const currentX = screenX - rect.left;
    const currentY = screenY - rect.top;
    const deltaX = currentX - this.dragStartPos.x;
    const deltaY = currentY - this.dragStartPos.y;

    // Determine slide direction if not yet determined
    if (!this.slideState) {
      const threshold = 10; // Minimum pixels to determine direction
      if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Horizontal slide - affects the row
          this.slideState = {
            type: 'row',
            index: this.dragStartCell.row,
            offset: 0,
            startX: this.dragStartPos.x,
            startY: this.dragStartPos.y,
          };
        } else {
          // Vertical slide - affects the column
          this.slideState = {
            type: 'col',
            index: this.dragStartCell.col,
            offset: 0,
            startX: this.dragStartPos.x,
            startY: this.dragStartPos.y,
          };
        }
        this.gameState = 'sliding';
        this.api.sounds.select();
      }
    }

    // Update offset
    if (this.slideState) {
      if (this.slideState.type === 'row') {
        this.slideState.offset = currentX - this.slideState.startX;
      } else {
        this.slideState.offset = currentY - this.slideState.startY;
      }
      this.render();
    }
  }

  private endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (this.slideState && this.gameState === 'sliding') {
      // Calculate how many cells to shift
      const cellsToShift = Math.round(this.slideState.offset / this.cellSize);

      if (cellsToShift !== 0) {
        // Apply the shift to the grid
        this.applySlide(this.slideState.type, this.slideState.index, cellsToShift);

        // Animate snap to final position
        this.snapFrom = this.slideState.offset;
        this.snapTo = cellsToShift * this.cellSize;
        this.snapProgress = 0;
        this.snapStartTime = performance.now();
        this.gameState = 'snapping';

        this.api.sounds.place();
        this.api.haptics.tap();
      } else {
        // Snap back to original position
        this.snapFrom = this.slideState.offset;
        this.snapTo = 0;
        this.snapProgress = 0;
        this.snapStartTime = performance.now();
        this.gameState = 'snapping';
      }

      this.startAnimationLoop();
    } else {
      this.slideState = null;
      this.gameState = 'idle';
    }

    this.dragStartPos = null;
    this.dragStartCell = null;
  }

  private applySlide(type: 'row' | 'col', index: number, shift: number) {
    if (type === 'row') {
      // Shift row horizontally (with wrapping)
      const row = this.grid[index];
      const newRow: (Gem | null)[] = new Array(GRID_COLS);

      for (let col = 0; col < GRID_COLS; col++) {
        let sourceCol = col - shift;
        // Wrap around
        while (sourceCol < 0) sourceCol += GRID_COLS;
        while (sourceCol >= GRID_COLS) sourceCol -= GRID_COLS;
        newRow[col] = row[sourceCol];
      }

      this.grid[index] = newRow;
    } else {
      // Shift column vertically (with wrapping)
      const column: (Gem | null)[] = [];
      for (let row = 0; row < GRID_ROWS; row++) {
        column.push(this.grid[row][index]);
      }

      for (let row = 0; row < GRID_ROWS; row++) {
        let sourceRow = row - shift;
        // Wrap around
        while (sourceRow < 0) sourceRow += GRID_ROWS;
        while (sourceRow >= GRID_ROWS) sourceRow -= GRID_ROWS;
        this.grid[row][index] = column[sourceRow];
      }
    }
  }

  private processSnapComplete() {
    this.slideState = null;
    this.cascadeLevel = 1;
    this.processMatches();
  }

  private processMatches() {
    const matches = findMatches(this.grid);

    if (matches.length === 0) {
      // Check for game over
      if (isGameOver(this.grid)) {
        this.triggerDefeat();
      } else {
        this.gameState = 'idle';
      }
      return;
    }

    const result = analyzeMatches(this.grid, matches);

    // Collect all positions to clear
    const positionsToMark = new Set<string>();
    for (const match of matches) {
      for (const pos of match.positions) {
        positionsToMark.add(`${pos.row},${pos.col}`);
      }
    }

    // Play sounds based on match size
    const totalCleared = positionsToMark.size;
    if (totalCleared >= 5) {
      this.api.sounds.clearMulti(totalCleared);
    } else {
      this.api.sounds.clearSingle();
    }

    if (this.cascadeLevel > 1) {
      this.api.sounds.combo(this.cascadeLevel);
    }

    this.api.haptics.success();

    // Store positions marked for clearing
    this.clearingPositions = positionsToMark;

    // Create special gems
    for (const special of result.specialGems) {
      const { position, type, colorIndex } = special;
      this.grid[position.row][position.col] = createSpecialGem(colorIndex, type);
      this.grid[position.row][position.col]!.scale = 0;
      this.clearingPositions.delete(`${position.row},${position.col}`);
    }

    // Calculate score
    let points = 0;
    for (const match of matches) {
      points += calculateMatchScore(match.length, false, this.cascadeLevel);
    }
    this.score += points;
    this.api.setScore(this.score);

    // Spawn particles for cleared positions
    const clearPositions: Position[] = [];
    for (const key of this.clearingPositions) {
      const [row, col] = key.split(',').map(Number);
      clearPositions.push({ row, col });
    }
    this.spawnClearParticles(clearPositions);

    // Show floating text
    if (clearPositions.length > 0) {
      const sumX = clearPositions.reduce(
        (sum, p) => sum + this.gridOffsetX + p.col * this.cellSize + this.cellSize / 2,
        0
      );
      const sumY = clearPositions.reduce(
        (sum, p) => sum + this.gridOffsetY + p.row * this.cellSize + this.cellSize / 2,
        0
      );
      const centerX = sumX / clearPositions.length;
      const centerY = sumY / clearPositions.length;

      this.floatingTexts.push(createFloatingText(centerX, centerY - 20, `+${points}`, '#fbbf24', 22));

      if (this.cascadeLevel >= 2) {
        const { word, color } = getComboWord(this.cascadeLevel);
        this.floatingTexts.push(createFloatingText(centerX, centerY - 50, word, color, 26));
      }
    }

    this.clearProgress = 0;
    this.clearStartTime = performance.now();
    this.gameState = 'clearing';
  }

  private spawnClearParticles(positions: Position[]) {
    for (const pos of positions) {
      const gem = this.grid[pos.row][pos.col];
      if (!gem) continue;

      const x = this.gridOffsetX + pos.col * this.cellSize + this.cellSize / 2;
      const y = this.gridOffsetY + pos.row * this.cellSize + this.cellSize / 2;
      this.particles.push(...generateParticlesAt(x, y, gem.color, 6));
    }
  }

  private processClearComplete() {
    // Check for special gems in cleared positions and activate them
    const specialsToActivate: { pos: Position; gem: Gem }[] = [];

    for (const key of this.clearingPositions) {
      const [row, col] = key.split(',').map(Number);
      const gem = this.grid[row][col];
      if (gem && gem.type !== 'normal') {
        specialsToActivate.push({ pos: { row, col }, gem });
      }
    }

    // Activate special gems
    if (specialsToActivate.length > 0) {
      for (const { pos, gem } of specialsToActivate) {
        this.activateSpecialGem(pos, gem);
      }
    }

    // Remove cleared gems
    for (const key of this.clearingPositions) {
      const [row, col] = key.split(',').map(Number);
      this.grid[row][col] = null;
    }
    this.clearingPositions.clear();

    // Apply gravity
    const movements = applyGravity(this.grid);

    // Fill empty cells
    const newGems = fillEmptyCells(this.grid);

    // Track falling gems for animation
    this.fallingGems = [];

    for (const move of movements) {
      const gem = this.grid[move.toRow][move.col];
      if (gem) {
        gem.offsetY = (move.fromRow - move.toRow) * this.cellSize;
        this.fallingGems.push({
          col: move.col,
          fromRow: move.fromRow,
          toRow: move.toRow,
          gem,
        });
      }
    }

    for (const { row, col, gem } of newGems) {
      this.fallingGems.push({
        col,
        fromRow: row - GRID_ROWS,
        toRow: row,
        gem,
      });
    }

    if (this.fallingGems.length > 0) {
      this.fallProgress = 0;
      this.fallStartTime = performance.now();
      this.gameState = 'falling';
      this.api.sounds.drop();
    } else {
      this.cascadeLevel++;
      this.processMatches();
    }
  }

  private activateSpecialGem(pos: Position, gem: Gem) {
    const positions = getSpecialGemClearPositions(this.grid, pos, gem);

    // Create visual effect
    const effectX = this.gridOffsetX + pos.col * this.cellSize;
    const effectY = this.gridOffsetY + pos.row * this.cellSize;

    if (gem.type === 'line_h' || gem.type === 'line_v') {
      this.specialEffects.push({
        type: gem.type,
        x: effectX,
        y: effectY,
        progress: 0,
      });
    } else if (gem.type === 'bomb') {
      this.specialEffects.push({
        type: 'bomb',
        x: effectX,
        y: effectY,
        progress: 0,
      });
      this.screenShake = 1;
      this.screenShakeDecay = 0.95;
    } else if (gem.type === 'rainbow') {
      // Rainbow clears a random color
      const colors = new Set<number>();
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const g = this.grid[r][c];
          if (g && g.colorIndex >= 0) colors.add(g.colorIndex);
        }
      }
      if (colors.size > 0) {
        const colorArray = Array.from(colors);
        const targetColor = colorArray[Math.floor(Math.random() * colorArray.length)];
        const rainbowPositions = getColorMatchPositions(this.grid, targetColor);

        const effectPositions = rainbowPositions.map((p) => ({
          x: this.gridOffsetX + p.col * this.cellSize,
          y: this.gridOffsetY + p.row * this.cellSize,
        }));

        this.specialEffects.push({
          type: 'rainbow',
          x: effectX,
          y: effectY,
          progress: 0,
          positions: effectPositions,
        });

        for (const p of rainbowPositions) {
          this.clearingPositions.add(`${p.row},${p.col}`);
        }
      }
    }

    this.api.sounds.burst();

    // Mark positions for clearing
    for (const p of positions) {
      this.clearingPositions.add(`${p.row},${p.col}`);
    }

    // Spawn particles
    for (const p of positions) {
      const g = this.grid[p.row][p.col];
      if (g) {
        const x = this.gridOffsetX + p.col * this.cellSize + this.cellSize / 2;
        const y = this.gridOffsetY + p.row * this.cellSize + this.cellSize / 2;
        this.particles.push(...generateParticlesAt(x, y, g.color, 4));
      }
    }

    // Add score
    const points = 150 * positions.length * this.cascadeLevel;
    this.score += points;
    this.api.setScore(this.score);

    this.floatingTexts.push(
      createFloatingText(effectX + this.cellSize / 2, effectY, `+${points}`, '#fbbf24', 20)
    );
  }

  private processFallComplete() {
    // Reset all gem offsets
    for (const { gem } of this.fallingGems) {
      gem.offsetY = 0;
    }
    this.fallingGems = [];

    // Increment cascade and check for more matches
    this.cascadeLevel++;
    this.processMatches();
  }

  private triggerDefeat() {
    this.gameState = 'defeat';
    this.defeatAnimation = createDefeatAnimation();
    this.api.sounds.gameOver();

    // Generate particles from all gems
    const cells: { x: number; y: number; color: string }[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const gem = this.grid[row][col];
        if (gem) {
          cells.push({
            x: this.gridOffsetX + col * this.cellSize + this.cellSize / 2,
            y: this.gridOffsetY + row * this.cellSize + this.cellSize / 2,
            color: gem.color,
          });
        }
      }
    }
    this.particles.push(...generateDefeatParticles(cells));
  }

  private startAnimationLoop = () => {
    if (this.isDestroyed || this.isPaused) return;

    this.update();
    this.render();

    const hasAnimations =
      this.gameState !== 'idle' ||
      hasActiveEffects(this.particles, this.floatingTexts) ||
      this.screenShake > 0.01 ||
      this.specialEffects.length > 0;

    if (hasAnimations || this.defeatAnimation) {
      this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
    }
  };

  private update() {
    const now = performance.now();

    // Update screen shake
    if (this.screenShake > 0.01) {
      this.screenShake *= this.screenShakeDecay;
    } else {
      this.screenShake = 0;
    }

    // Update special effects
    this.specialEffects = this.specialEffects.filter((effect) => {
      effect.progress += 0.05;
      return effect.progress < 1;
    });

    // Update gem animations (scale, shake)
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const gem = this.grid[row][col];
        if (!gem) continue;

        // Scale animation for new/special gems
        if (gem.scale < 1) {
          gem.scale = Math.min(1, gem.scale + 0.1);
        }

        // Shake decay
        if (gem.shake > 0) {
          gem.shake = Math.max(0, gem.shake - 0.1);
        }
      }
    }

    // Update based on game state
    switch (this.gameState) {
      case 'snapping': {
        const elapsed = now - this.snapStartTime;
        this.snapProgress = Math.min(1, elapsed / this.SNAP_DURATION);

        if (this.slideState) {
          // Ease out
          const eased = 1 - Math.pow(1 - this.snapProgress, 3);
          this.slideState.offset = this.snapFrom + (this.snapTo - this.snapFrom) * eased;
        }

        if (this.snapProgress >= 1) {
          this.processSnapComplete();
        }
        break;
      }

      case 'clearing': {
        const elapsed = now - this.clearStartTime;
        this.clearProgress = Math.min(1, elapsed / this.CLEAR_DURATION);

        // Animate clearing gems (shrink)
        for (const key of this.clearingPositions) {
          const [row, col] = key.split(',').map(Number);
          const gem = this.grid[row][col];
          if (gem) {
            gem.scale = Math.max(0, 1 - this.clearProgress);
          }
        }

        if (this.clearProgress >= 1) {
          this.processClearComplete();
        }
        break;
      }

      case 'falling': {
        const elapsed = now - this.fallStartTime;
        this.fallProgress = Math.min(1, elapsed / this.FALL_DURATION);

        // Ease out bounce
        const eased = this.easeOutBounce(this.fallProgress);

        // Animate falling gems
        for (const { gem, fromRow, toRow } of this.fallingGems) {
          const distance = (fromRow - toRow) * this.cellSize;
          gem.offsetY = distance * (1 - eased);
        }

        if (this.fallProgress >= 1) {
          this.processFallComplete();
        }
        break;
      }

      case 'defeat': {
        if (isDefeatComplete(this.defeatAnimation)) {
          this.api.gameOver(this.score);
        }
        break;
      }
    }

    // Filter expired effects
    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);
  }

  private easeOutBounce(x: number): number {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (x < 1 / d1) {
      return n1 * x * x;
    } else if (x < 2 / d1) {
      return n1 * (x -= 1.5 / d1) * x + 0.75;
    } else if (x < 2.5 / d1) {
      return n1 * (x -= 2.25 / d1) * x + 0.9375;
    } else {
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    }
  }

  private render() {
    if (this.isDestroyed || this.grid.length === 0) return;
    const rect = this.container.getBoundingClientRect();

    // Get shake offset
    const shake = this.defeatAnimation
      ? getShakeOffset(this.defeatAnimation)
      : { x: this.screenShake * (Math.random() - 0.5) * 10, y: this.screenShake * (Math.random() - 0.5) * 10 };

    this.ctx.clearRect(0, 0, rect.width, rect.height);

    this.ctx.save();
    this.ctx.translate(shake.x, shake.y);

    // Draw grid background
    drawGridBackground(this.ctx, this.gridOffsetX, this.gridOffsetY, this.cellSize);

    // Draw gems with slide offset
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const gem = this.grid[row][col];
        if (!gem) continue;

        let x = this.gridOffsetX + col * this.cellSize;
        let y = this.gridOffsetY + row * this.cellSize;

        // Apply slide offset
        if (this.slideState) {
          if (this.slideState.type === 'row' && this.slideState.index === row) {
            x += this.slideState.offset;
            // Wrap rendering
            const gridWidth = this.cellSize * GRID_COLS;
            if (x < this.gridOffsetX - this.cellSize) {
              x += gridWidth;
            } else if (x > this.gridOffsetX + gridWidth - this.cellSize) {
              // Draw wrapped version on the other side
              this.ctx.save();
              this.ctx.beginPath();
              this.ctx.rect(this.gridOffsetX, this.gridOffsetY, gridWidth, this.cellSize * GRID_ROWS);
              this.ctx.clip();
              drawGem(this.ctx, x - gridWidth, y, this.cellSize, gem);
              this.ctx.restore();
            }
          } else if (this.slideState.type === 'col' && this.slideState.index === col) {
            y += this.slideState.offset;
            // Wrap rendering
            const gridHeight = this.cellSize * GRID_ROWS;
            if (y < this.gridOffsetY - this.cellSize) {
              y += gridHeight;
            } else if (y > this.gridOffsetY + gridHeight - this.cellSize) {
              // Draw wrapped version on the other side
              this.ctx.save();
              this.ctx.beginPath();
              this.ctx.rect(this.gridOffsetX, this.gridOffsetY, this.cellSize * GRID_COLS, gridHeight);
              this.ctx.clip();
              drawGem(this.ctx, x, y - gridHeight, this.cellSize, gem);
              this.ctx.restore();
            }
          }
        }

        // Clip to grid area for sliding
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(this.gridOffsetX, this.gridOffsetY, this.cellSize * GRID_COLS, this.cellSize * GRID_ROWS);
        this.ctx.clip();
        drawGem(this.ctx, x, y, this.cellSize, gem);
        this.ctx.restore();
      }
    }

    // Draw special effects
    for (const effect of this.specialEffects) {
      switch (effect.type) {
        case 'line_h':
        case 'line_v':
          drawLineBlasterEffect(
            this.ctx,
            effect.x,
            effect.y,
            this.cellSize,
            effect.type === 'line_h',
            effect.progress,
            this.gridOffsetX,
            this.gridOffsetY
          );
          break;
        case 'bomb':
          drawBombEffect(this.ctx, effect.x, effect.y, this.cellSize, effect.progress);
          break;
        case 'rainbow':
          if (effect.positions) {
            drawRainbowEffect(this.ctx, effect.positions, effect.progress, this.cellSize);
          }
          break;
      }
    }

    this.ctx.restore();

    // Draw particles and floating text (not affected by shake)
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(this.ctx, this.particles, reduceMotion);
    drawFloatingTexts(this.ctx, this.floatingTexts, reduceMotion);

    // Draw defeat overlay
    drawDefeatOverlay(this.ctx, rect.width, rect.height, this.defeatAnimation);

    // Draw slide indicator during idle
    if (this.gameState === 'idle' && !this.isDragging) {
      this.drawSlideHint();
    }
  }

  private drawSlideHint() {
    // Draw subtle arrows on edges to indicate sliding is possible
    const ctx = this.ctx;
    const alpha = 0.3 + Math.sin(performance.now() / 500) * 0.1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Left/right arrows for rows
    const midRow = Math.floor(GRID_ROWS / 2);
    const leftX = this.gridOffsetX - 15;
    const rightX = this.gridOffsetX + this.cellSize * GRID_COLS + 15;
    const rowY = this.gridOffsetY + midRow * this.cellSize + this.cellSize / 2;

    ctx.fillText('◀', leftX, rowY);
    ctx.fillText('▶', rightX, rowY);

    // Up/down arrows for columns
    const midCol = Math.floor(GRID_COLS / 2);
    const colX = this.gridOffsetX + midCol * this.cellSize + this.cellSize / 2;
    const topY = this.gridOffsetY - 15;
    const bottomY = this.gridOffsetY + this.cellSize * GRID_ROWS + 15;

    ctx.fillText('▲', colX, topY);
    ctx.fillText('▼', colX, bottomY);

    ctx.restore();
  }

  start() {
    this.grid = initializeGrid();
    this.score = 0;
    this.cascadeLevel = 1;
    this.gameState = 'idle';
    this.slideState = null;
    this.isDragging = false;
    this.particles = [];
    this.floatingTexts = [];
    this.specialEffects = [];
    this.screenShake = 0;
    this.defeatAnimation = null;
    this.isPaused = false;
    this.api.setScore(0);
    this.api.sounds.gameStart();
    this.render();
    this.startAnimationLoop();
  }

  pause() {
    this.isPaused = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  resume() {
    this.isPaused = false;
    this.startAnimationLoop();
  }

  reset() {
    this.start();
  }

  destroy() {
    this.isDestroyed = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.removeEventListeners();
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}
