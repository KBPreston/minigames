import type { GameAPI, GameInstance } from '../../core/types';
import { generateRandomPiece, Piece, getPieceBounds } from './pieces';
import {
  Grid,
  createEmptyGrid,
  canPlacePiece,
  placePiece,
  isGameOver,
  calculateScore,
  GRID_COLS,
  GRID_ROWS,
} from './logic';
import {
  Particle,
  FloatingText,
  DefeatAnimation,
  generateParticlesAt,
  createFloatingText,
  getBlockBlastWord,
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

const QUEUE_SIZE = 3;

export class BlockBlastGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private grid: Grid = createEmptyGrid();
  private pieceQueue: Piece[] = [];
  private selectedPieceIndex: number = 0;
  private score: number = 0;
  private comboMultiplier: number = 1;

  private ghostPosition: { row: number; col: number } | null = null;
  private cellSize: number = 0;
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;

  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private isMouseDown: boolean = false;

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
    const availableHeight = rect.height - padding * 2 - 120;

    this.cellSize = Math.floor(Math.min(availableWidth / GRID_COLS, availableHeight / GRID_ROWS));
    const gridWidth = this.cellSize * GRID_COLS;

    this.gridOffsetX = (rect.width - gridWidth) / 2;
    this.gridOffsetY = padding;

    this.render();
  };

  private setupEventListeners() {
    this.container.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.container.addEventListener('mousedown', this.handleMouseDown);
    this.container.addEventListener('mousemove', this.handleMouseMove);
    this.container.addEventListener('mouseup', this.handleMouseUp);
    this.container.addEventListener('mouseleave', this.handleMouseLeave);
  }

  private removeEventListeners() {
    this.container.removeEventListener('touchstart', this.handleTouchStart);
    this.container.removeEventListener('touchmove', this.handleTouchMove);
    this.container.removeEventListener('touchend', this.handleTouchEnd);
    this.container.removeEventListener('mousedown', this.handleMouseDown);
    this.container.removeEventListener('mousemove', this.handleMouseMove);
    this.container.removeEventListener('mouseup', this.handleMouseUp);
    this.container.removeEventListener('mouseleave', this.handleMouseLeave);
  }

  private handleTouchStart = (e: TouchEvent) => {
    if (this.isPaused) return;
    e.preventDefault();
    this.updateFromScreen(e.touches[0].clientX, e.touches[0].clientY);
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (this.isPaused) return;
    e.preventDefault();
    this.updateFromScreen(e.touches[0].clientX, e.touches[0].clientY);
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (this.isPaused) return;
    e.preventDefault();
    this.tryPlacePiece();
    this.ghostPosition = null;
    this.render();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isPaused) return;
    this.isMouseDown = true;
    this.updateFromScreen(e.clientX, e.clientY);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.isPaused || !this.isMouseDown) return;
    this.updateFromScreen(e.clientX, e.clientY);
  };

  private handleMouseUp = () => {
    if (this.isPaused || !this.isMouseDown) return;
    this.tryPlacePiece();
    this.ghostPosition = null;
    this.isMouseDown = false;
    this.render();
  };

  private handleMouseLeave = () => {
    if (this.isMouseDown) {
      this.ghostPosition = null;
      this.isMouseDown = false;
      this.render();
    }
  };

  private updateFromScreen(screenX: number, screenY: number) {
    const rect = this.container.getBoundingClientRect();
    const localY = screenY - rect.top;
    const queueY = this.gridOffsetY + this.cellSize * GRID_ROWS + 20;

    if (localY > queueY - 20) {
      const spacing = rect.width / (this.pieceQueue.length + 1);
      const localX = screenX - rect.left;
      const pieceIndex = Math.floor(localX / spacing);
      if (pieceIndex >= 0 && pieceIndex < this.pieceQueue.length) {
        if (pieceIndex !== this.selectedPieceIndex) {
          this.selectedPieceIndex = pieceIndex;
          this.api.haptics.tap();
          this.api.sounds.select();
        }
      }
      this.ghostPosition = null;
    } else {
      const x = screenX - rect.left - this.gridOffsetX;
      const y = screenY - rect.top - this.gridOffsetY;
      if (x >= 0 && y >= 0) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
          this.ghostPosition = { row, col };
        }
      }
    }
    this.render();
  }

  private tryPlacePiece() {
    if (!this.ghostPosition) return;
    const piece = this.pieceQueue[this.selectedPieceIndex];
    if (!piece) return;

    const { row, col } = this.ghostPosition;
    if (!canPlacePiece(this.grid, piece, row, col)) return;

    // Store colors before clearing for particles
    const cellColors: Map<string, string> = new Map();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r][c].color) {
          cellColors.set(`${r},${c}`, this.grid[r][c].color!);
        }
      }
    }
    // Also add the piece colors
    for (const [dr, dc] of piece.shape) {
      cellColors.set(`${row + dr},${col + dc}`, piece.color);
    }

    const result = placePiece(this.grid, piece, row, col);
    if (result.success) {
      const hasClears = result.clearedRows.length > 0 || result.clearedCols.length > 0;
      const linesCleared = result.clearedRows.length + result.clearedCols.length;

      if (hasClears) {
        this.comboMultiplier += 0.5;
        this.api.haptics.success();

        // Play appropriate clear sound
        if (linesCleared >= 2) {
          this.api.sounds.clearMulti(linesCleared);
          this.api.sounds.combo(this.comboMultiplier);
        } else {
          this.api.sounds.clearSingle();
        }

        // Generate particles for cleared cells
        const clearedCells: Set<string> = new Set();

        for (const r of result.clearedRows) {
          for (let c = 0; c < GRID_COLS; c++) {
            clearedCells.add(`${r},${c}`);
          }
        }
        for (const c of result.clearedCols) {
          for (let r = 0; r < GRID_ROWS; r++) {
            clearedCells.add(`${r},${c}`);
          }
        }

        // Spawn particles
        let sumX = 0, sumY = 0, count = 0;
        for (const key of clearedCells) {
          const [r, c] = key.split(',').map(Number);
          const x = this.gridOffsetX + c * this.cellSize + this.cellSize / 2;
          const y = this.gridOffsetY + r * this.cellSize + this.cellSize / 2;
          const color = cellColors.get(key) || piece.color;

          this.particles.push(...generateParticlesAt(x, y, color, 4));
          sumX += x;
          sumY += y;
          count++;
        }

        // Calculate center for floating text
        const centerX = sumX / count;
        const centerY = sumY / count;

        // Calculate points before adding
        const points = calculateScore(
          result.placedTiles.length,
          result.clearedRows.length,
          result.clearedCols.length,
          this.comboMultiplier
        );

        // Add floating text for points
        this.floatingTexts.push(createFloatingText(centerX, centerY - 15, `+${points}`, '#fbbf24', 22));

        // Add celebratory word
        const { word, color: wordColor } = getBlockBlastWord(linesCleared);
        this.floatingTexts.push(
          createFloatingText(centerX, centerY - 45, word, wordColor, linesCleared >= 3 ? 28 : 22)
        );

        this.score += points;
      } else {
        this.comboMultiplier = 1;
        this.api.haptics.tap();
        this.api.sounds.place();

        const points = calculateScore(
          result.placedTiles.length,
          result.clearedRows.length,
          result.clearedCols.length,
          this.comboMultiplier
        );
        this.score += points;
      }

      this.api.setScore(this.score);
      this.pieceQueue[this.selectedPieceIndex] = generateRandomPiece();

      if (isGameOver(this.grid, this.pieceQueue)) {
        this.triggerDefeat();
        return;
      }

      // Start animation loop if we have effects
      if (hasActiveEffects(this.particles, this.floatingTexts)) {
        this.startAnimationLoop();
      }
    }
  }

  private triggerDefeat() {
    this.defeatAnimation = createDefeatAnimation();

    // Generate particles from all filled cells
    const cells: { x: number; y: number; color: string }[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = this.grid[r][c];
        if (cell.filled && cell.color) {
          cells.push({
            x: this.gridOffsetX + c * this.cellSize + this.cellSize / 2,
            y: this.gridOffsetY + r * this.cellSize + this.cellSize / 2,
            color: cell.color,
          });
        }
      }
    }
    this.particles.push(...generateDefeatParticles(cells));

    this.startAnimationLoop();
  }

  private startAnimationLoop = () => {
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
      this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
    }
  };

  private render() {
    if (this.isDestroyed || this.pieceQueue.length === 0) return;
    const rect = this.container.getBoundingClientRect();

    // Apply shake offset during defeat
    const shake = getShakeOffset(this.defeatAnimation);

    this.ctx.clearRect(0, 0, rect.width, rect.height);

    // Apply shake via translate
    this.ctx.save();
    this.ctx.translate(shake.x, shake.y);

    this.drawGrid();
    this.drawGhost();
    this.drawPieceQueue();

    this.ctx.restore();

    // Draw effects
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(this.ctx, this.particles, reduceMotion);
    drawFloatingTexts(this.ctx, this.floatingTexts, reduceMotion);

    // Draw defeat overlay
    drawDefeatOverlay(this.ctx, rect.width, rect.height, this.defeatAnimation);
  }

  private drawGrid() {
    const { ctx, cellSize, gridOffsetX, gridOffsetY } = this;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(gridOffsetX, gridOffsetY, cellSize * GRID_COLS, cellSize * GRID_ROWS);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(gridOffsetX + i * cellSize, gridOffsetY);
      ctx.lineTo(gridOffsetX + i * cellSize, gridOffsetY + cellSize * GRID_ROWS);
      ctx.stroke();
    }
    for (let i = 0; i <= GRID_ROWS; i++) {
      ctx.beginPath();
      ctx.moveTo(gridOffsetX, gridOffsetY + i * cellSize);
      ctx.lineTo(gridOffsetX + cellSize * GRID_COLS, gridOffsetY + i * cellSize);
      ctx.stroke();
    }

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const cell = this.grid[row][col];
        if (cell.filled && cell.color) {
          this.drawCell(row, col, cell.color, 1);
        }
      }
    }
  }

  private drawCell(row: number, col: number, color: string, opacity: number) {
    const { ctx, cellSize, gridOffsetX, gridOffsetY } = this;
    const x = gridOffsetX + col * cellSize;
    const y = gridOffsetY + row * cellSize;
    const pad = 2;

    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawGhost() {
    if (!this.ghostPosition) return;
    const piece = this.pieceQueue[this.selectedPieceIndex];
    const valid = canPlacePiece(this.grid, piece, this.ghostPosition.row, this.ghostPosition.col);
    const color = valid ? piece.color : '#ef4444';
    const opacity = valid ? 0.5 : 0.25;

    for (const [dr, dc] of piece.shape) {
      const row = this.ghostPosition.row + dr;
      const col = this.ghostPosition.col + dc;
      if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        this.drawCell(row, col, color, opacity);
      }
    }
  }

  private drawPieceQueue() {
    const { ctx, cellSize } = this;
    const rect = this.container.getBoundingClientRect();
    const queueY = this.gridOffsetY + cellSize * GRID_ROWS + 20;
    const pieceSize = Math.min(cellSize * 0.6, 35);
    const spacing = rect.width / (this.pieceQueue.length + 1);

    for (let i = 0; i < this.pieceQueue.length; i++) {
      const piece = this.pieceQueue[i];
      const centerX = spacing * (i + 1);
      const isSelected = i === this.selectedPieceIndex;

      if (isSelected) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.beginPath();
        ctx.arc(centerX, queueY + 30, 45, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const bounds = getPieceBounds(piece.shape);
      const pw = bounds.width * pieceSize;
      const ph = bounds.height * pieceSize;
      const startX = centerX - pw / 2;
      const startY = queueY + 30 - ph / 2;

      for (const [dr, dc] of piece.shape) {
        ctx.fillStyle = piece.color;
        ctx.beginPath();
        ctx.roundRect(startX + dc * pieceSize + 2, startY + dr * pieceSize + 2, pieceSize - 4, pieceSize - 4, 3);
        ctx.fill();
      }
    }
  }

  start() {
    this.grid = createEmptyGrid();
    this.pieceQueue = Array.from({ length: QUEUE_SIZE }, () => generateRandomPiece());
    this.selectedPieceIndex = 0;
    this.score = 0;
    this.comboMultiplier = 1;
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
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  resume() {
    this.isPaused = false;
    this.render();
    if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.startAnimationLoop();
    }
  }

  reset() { this.start(); }

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
