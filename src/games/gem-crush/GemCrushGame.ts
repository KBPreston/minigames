import type { GameAPI, GameInstance } from '../../core/types';
import {
  Grid,
  Position,
  Gem,
  HintMove,
  GRID_COLS,
  GRID_ROWS,
} from './types';
import {
  initializeGrid,
  areAdjacent,
  swapGems,
  findMatches,
  analyzeMatches,
  getSpecialGemClearPositions,
  getColorMatchPositions,
  applyGravity,
  fillEmptyCells,
  wouldSwapMatch,
  findValidMove,
  isGameOver,
  getComboWord,
  calculateMatchScore,
  createSpecialGem,
} from './logic';
import {
  drawGem,
  drawGridBackground,
  drawSwapAnimation,
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

type GameState = 'idle' | 'swapping' | 'reversing' | 'clearing' | 'falling' | 'checking' | 'defeat';

interface SpecialEffect {
  type: 'line_h' | 'line_v' | 'bomb' | 'rainbow';
  x: number;
  y: number;
  progress: number;
  positions?: { x: number; y: number }[];
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
  private selectedGem: Position | null = null;

  // Animation state
  private swapFrom: Position | null = null;
  private swapTo: Position | null = null;
  private swapProgress: number = 0;
  private swapStartTime: number = 0;
  private readonly SWAP_DURATION = 200;

  private clearingPositions: Set<string> = new Set();
  private clearProgress: number = 0;
  private clearStartTime: number = 0;
  private readonly CLEAR_DURATION = 250;

  private fallingGems: { col: number; fromRow: number; toRow: number; gem: Gem }[] = [];
  private fallProgress: number = 0;
  private fallStartTime: number = 0;
  private readonly FALL_DURATION = 300;

  // Hint system
  private hintMove: HintMove | null = null;
  private lastInteractionTime: number = 0;
  private readonly HINT_DELAY = 5000;

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
  }

  private removeEventListeners() {
    this.container.removeEventListener('touchstart', this.handleTouchStart);
    this.container.removeEventListener('touchmove', this.handleTouchMove);
    this.container.removeEventListener('touchend', this.handleTouchEnd);
    this.container.removeEventListener('mousedown', this.handleMouseDown);
    this.container.removeEventListener('mousemove', this.handleMouseMove);
    this.container.removeEventListener('mouseup', this.handleMouseUp);
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
    const pos = this.screenToGrid(e.touches[0].clientX, e.touches[0].clientY);
    if (pos) {
      this.handleGemSelect(pos);
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (this.isPaused || this.gameState !== 'idle') return;
    e.preventDefault();

    if (this.selectedGem) {
      const pos = this.screenToGrid(e.touches[0].clientX, e.touches[0].clientY);
      if (pos && areAdjacent(this.selectedGem, pos)) {
        this.trySwap(this.selectedGem, pos);
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (this.isPaused) return;
    e.preventDefault();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isPaused || this.gameState !== 'idle') return;
    const pos = this.screenToGrid(e.clientX, e.clientY);
    if (pos) {
      this.handleGemSelect(pos);
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.isPaused || this.gameState !== 'idle') return;

    if (this.selectedGem && e.buttons === 1) {
      const pos = this.screenToGrid(e.clientX, e.clientY);
      if (pos && areAdjacent(this.selectedGem, pos)) {
        this.trySwap(this.selectedGem, pos);
      }
    }
  };

  private handleMouseUp = () => {
    // Selection persists for click-based swapping
  };

  private handleGemSelect(pos: Position) {
    this.lastInteractionTime = performance.now();
    this.hintMove = null;

    const gem = this.grid[pos.row][pos.col];
    if (!gem) return;

    if (this.selectedGem) {
      if (this.selectedGem.row === pos.row && this.selectedGem.col === pos.col) {
        // Deselect
        this.selectedGem = null;
        this.api.haptics.tap();
      } else if (areAdjacent(this.selectedGem, pos)) {
        // Try to swap
        this.trySwap(this.selectedGem, pos);
      } else {
        // Select new gem
        this.selectedGem = pos;
        this.api.haptics.tap();
        this.api.sounds.select();
      }
    } else {
      // Select gem
      this.selectedGem = pos;
      this.api.haptics.tap();
      this.api.sounds.select();
    }

    this.render();
  }

  private trySwap(from: Position, to: Position) {
    this.lastInteractionTime = performance.now();
    this.hintMove = null;

    const gem1 = this.grid[from.row][from.col];
    const gem2 = this.grid[to.row][to.col];

    if (!gem1 || !gem2) return;

    // Check if swap is valid
    const isValid = wouldSwapMatch(this.grid, from, to);

    this.swapFrom = from;
    this.swapTo = to;
    this.swapProgress = 0;
    this.swapStartTime = performance.now();
    this.gameState = isValid ? 'swapping' : 'reversing';
    this.selectedGem = null;

    if (isValid) {
      this.api.haptics.tap();
      this.api.sounds.place();
    } else {
      this.api.sounds.invalid();
    }

    this.startAnimationLoop();
  }

  private processSwapComplete() {
    if (!this.swapFrom || !this.swapTo) return;

    // Actually swap the gems in the grid
    swapGems(this.grid, this.swapFrom, this.swapTo);

    // Check for special gem activations
    const gem1 = this.grid[this.swapFrom.row][this.swapFrom.col];
    const gem2 = this.grid[this.swapTo.row][this.swapTo.col];

    // Handle rainbow gem swap
    if (gem1?.type === 'rainbow' && gem2) {
      this.activateRainbowGem(this.swapFrom, gem2.colorIndex);
      return;
    }
    if (gem2?.type === 'rainbow' && gem1) {
      this.activateRainbowGem(this.swapTo, gem1.colorIndex);
      return;
    }

    // Check for special gems being activated
    const specialsToActivate: { pos: Position; gem: Gem }[] = [];
    if (gem1 && gem1.type !== 'normal') {
      specialsToActivate.push({ pos: this.swapFrom, gem: gem1 });
    }
    if (gem2 && gem2.type !== 'normal') {
      specialsToActivate.push({ pos: this.swapTo, gem: gem2 });
    }

    if (specialsToActivate.length > 0) {
      this.activateSpecialGems(specialsToActivate);
      return;
    }

    // Normal match processing
    this.cascadeLevel = 1;
    this.processMatches();
  }

  private activateRainbowGem(pos: Position, targetColorIndex: number) {
    if (targetColorIndex < 0) return;

    const positions = getColorMatchPositions(this.grid, targetColorIndex);
    positions.push(pos); // Include the rainbow gem itself

    // Create visual effect
    const effectPositions = positions.map((p) => ({
      x: this.gridOffsetX + p.col * this.cellSize,
      y: this.gridOffsetY + p.row * this.cellSize,
    }));

    this.specialEffects.push({
      type: 'rainbow',
      x: this.gridOffsetX + pos.col * this.cellSize,
      y: this.gridOffsetY + pos.row * this.cellSize,
      progress: 0,
      positions: effectPositions,
    });

    this.api.sounds.burst();
    this.api.haptics.success();

    // Clear all matching gems
    for (const p of positions) {
      this.clearingPositions.add(`${p.row},${p.col}`);
    }

    // Calculate score
    const points = 150 * positions.length * this.cascadeLevel;
    this.score += points;
    this.api.setScore(this.score);

    // Spawn particles
    this.spawnClearParticles(positions);

    // Show floating text
    const centerX = this.gridOffsetX + pos.col * this.cellSize + this.cellSize / 2;
    const centerY = this.gridOffsetY + pos.row * this.cellSize + this.cellSize / 2;
    this.floatingTexts.push(createFloatingText(centerX, centerY - 20, `+${points}`, '#fbbf24', 24));

    this.clearProgress = 0;
    this.clearStartTime = performance.now();
    this.gameState = 'clearing';
  }

  private activateSpecialGems(specials: { pos: Position; gem: Gem }[]) {
    const allPositions: Position[] = [];

    for (const { pos, gem } of specials) {
      const positions = getSpecialGemClearPositions(this.grid, pos, gem);
      allPositions.push(...positions);

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
      }

      this.api.sounds.burst();
    }

    this.api.haptics.success();

    // Mark all positions for clearing
    for (const p of allPositions) {
      this.clearingPositions.add(`${p.row},${p.col}`);
    }

    // Calculate score
    const points = 150 * allPositions.length * this.cascadeLevel;
    this.score += points;
    this.api.setScore(this.score);

    // Spawn particles
    this.spawnClearParticles(allPositions);

    // Show floating text
    if (specials.length > 0) {
      const centerX = this.gridOffsetX + specials[0].pos.col * this.cellSize + this.cellSize / 2;
      const centerY = this.gridOffsetY + specials[0].pos.row * this.cellSize + this.cellSize / 2;
      this.floatingTexts.push(createFloatingText(centerX, centerY - 20, `+${points}`, '#fbbf24', 24));
    }

    this.clearProgress = 0;
    this.clearStartTime = performance.now();
    this.gameState = 'clearing';
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

    // Store positions marked for clearing (but don't clear yet - will create specials first)
    this.clearingPositions = positionsToMark;

    // Create special gems
    for (const special of result.specialGems) {
      const { position, type, colorIndex } = special;
      this.grid[position.row][position.col] = createSpecialGem(colorIndex, type);
      this.grid[position.row][position.col]!.scale = 0; // Start small for pop animation
      // Remove from clearing since we're keeping this position
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

  private updateHint() {
    if (this.gameState !== 'idle') return;

    const timeSinceInteraction = performance.now() - this.lastInteractionTime;
    if (timeSinceInteraction >= this.HINT_DELAY && !this.hintMove) {
      const move = findValidMove(this.grid);
      if (move) {
        this.hintMove = {
          from: move.from,
          to: move.to,
          highlightTime: performance.now(),
        };
      }
    }
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
      case 'swapping':
      case 'reversing': {
        const elapsed = now - this.swapStartTime;
        this.swapProgress = Math.min(1, elapsed / this.SWAP_DURATION);

        if (this.swapProgress >= 1) {
          if (this.gameState === 'swapping') {
            this.processSwapComplete();
          } else {
            // Reversal complete - shake gems to indicate invalid
            if (this.swapFrom && this.swapTo) {
              const gem1 = this.grid[this.swapFrom.row][this.swapFrom.col];
              const gem2 = this.grid[this.swapTo.row][this.swapTo.col];
              if (gem1) gem1.shake = 1;
              if (gem2) gem2.shake = 1;
            }
            this.gameState = 'idle';
            this.swapFrom = null;
            this.swapTo = null;
          }
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
            gem.scale = 1 - this.clearProgress;
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

      case 'idle': {
        this.updateHint();
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

    // Draw gems
    const now = performance.now();
    const hintPulse = this.hintMove ? ((now - this.hintMove.highlightTime) / 1000) % 1 : 0;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        // Skip gems being animated in swap
        if (
          (this.gameState === 'swapping' || this.gameState === 'reversing') &&
          this.swapFrom &&
          this.swapTo
        ) {
          if (
            (row === this.swapFrom.row && col === this.swapFrom.col) ||
            (row === this.swapTo.row && col === this.swapTo.col)
          ) {
            continue;
          }
        }

        const gem = this.grid[row][col];
        if (!gem) continue;

        const x = this.gridOffsetX + col * this.cellSize;
        const y = this.gridOffsetY + row * this.cellSize;

        const isSelected =
          this.selectedGem?.row === row && this.selectedGem?.col === col;

        const isHinted =
          this.hintMove &&
          ((this.hintMove.from.row === row && this.hintMove.from.col === col) ||
            (this.hintMove.to.row === row && this.hintMove.to.col === col));

        drawGem(this.ctx, x, y, this.cellSize, gem, isSelected, !!isHinted, hintPulse);
      }
    }

    // Draw swap animation
    if ((this.gameState === 'swapping' || this.gameState === 'reversing') && this.swapFrom && this.swapTo) {
      const gem1 = this.grid[this.swapFrom.row][this.swapFrom.col];
      const gem2 = this.grid[this.swapTo.row][this.swapTo.col];

      if (gem1 && gem2) {
        const x1 = this.gridOffsetX + this.swapFrom.col * this.cellSize;
        const y1 = this.gridOffsetY + this.swapFrom.row * this.cellSize;
        const x2 = this.gridOffsetX + this.swapTo.col * this.cellSize;
        const y2 = this.gridOffsetY + this.swapTo.row * this.cellSize;

        const progress = this.gameState === 'reversing'
          ? 1 - this.swapProgress // Reverse direction
          : this.swapProgress;

        drawSwapAnimation(this.ctx, gem1, gem2, x1, y1, x2, y2, this.cellSize, progress);
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
  }

  start() {
    this.grid = initializeGrid();
    this.score = 0;
    this.cascadeLevel = 1;
    this.gameState = 'idle';
    this.selectedGem = null;
    this.hintMove = null;
    this.lastInteractionTime = performance.now();
    this.particles = [];
    this.floatingTexts = [];
    this.specialEffects = [];
    this.screenShake = 0;
    this.defeatAnimation = null;
    this.isPaused = false;
    this.api.setScore(0);
    this.api.sounds.gameStart();
    this.render();

    // Start idle animation loop for hint system
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
    this.lastInteractionTime = performance.now(); // Reset hint timer
    this.hintMove = null;
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
