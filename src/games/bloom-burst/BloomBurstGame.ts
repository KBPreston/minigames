import type { GameAPI, GameInstance } from '../../core/types';
import {
  Renderer,
  BurstAnimation,
  RenderState,
  Particle,
  FloatingText,
  generateParticles,
  generateFloatingTexts,
} from './renderer';
import {
  DefeatAnimation,
  createDefeatAnimation,
  generateDefeatParticles,
  isDefeatComplete,
} from '../../core/effects';
import { generateRandomPiece, Piece, getPieceCenter } from './pieces';
import {
  Grid,
  createEmptyGrid,
  canPlacePiece,
  placePiece,
  isGameOver,
  calculateScore,
  GRID_SIZE,
} from './logic';

const QUEUE_SIZE = 3;
const BURST_DURATION = 400;

export class BloomBurstGame implements GameInstance {
  private api: GameAPI;
  private renderer: Renderer;
  private container: HTMLElement;

  private grid: Grid = createEmptyGrid();
  private pieceQueue: Piece[] = [];
  private selectedPieceIndex: number = 0;
  private score: number = 0;
  private comboMultiplier: number = 1;

  private ghostPosition: { row: number; col: number } | null = null;
  private burstAnimations: BurstAnimation[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  private animationFrameId: number = 0;
  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private settingsUnsub: (() => void) | null = null;
  private defeatAnimation: DefeatAnimation | null = null;

  constructor(container: HTMLElement, api: GameAPI) {
    this.container = container;
    this.api = api;
    this.renderer = new Renderer(container);

    this.setupEventListeners();
    this.settingsUnsub = api.onSettingsChanged(() => {
      this.render();
    });
  }

  private setupEventListeners() {
    // Touch events
    this.container.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.handleTouchEnd, { passive: false });

    // Mouse events for desktop testing
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

    const touch = e.touches[0];
    this.updateGhostFromScreen(touch.clientX, touch.clientY);
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (this.isPaused) return;
    e.preventDefault();

    const touch = e.touches[0];
    this.updateGhostFromScreen(touch.clientX, touch.clientY);
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (this.isPaused) return;
    e.preventDefault();

    this.tryPlacePiece();
    this.ghostPosition = null;
    this.render();
  };

  private isMouseDown = false;

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isPaused) return;
    this.isMouseDown = true;
    this.updateGhostFromScreen(e.clientX, e.clientY);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.isPaused || !this.isMouseDown) return;
    this.updateGhostFromScreen(e.clientX, e.clientY);
  };

  private handleMouseUp = () => {
    if (this.isPaused) return;
    if (this.isMouseDown) {
      this.tryPlacePiece();
      this.ghostPosition = null;
      this.isMouseDown = false;
      this.render();
    }
  };

  private handleMouseLeave = () => {
    if (this.isMouseDown) {
      this.ghostPosition = null;
      this.isMouseDown = false;
      this.render();
    }
  };

  private updateGhostFromScreen(screenX: number, screenY: number) {
    // Check if clicking on piece queue area
    const cellSize = this.renderer.getCellSize();
    const { y: gridOffsetY } = this.renderer.getGridOffset();
    const rect = this.container.getBoundingClientRect();
    const localY = screenY - rect.top;
    const queueY = gridOffsetY + cellSize * GRID_SIZE + 20;

    if (localY > queueY - 20) {
      // Clicking in piece queue area - select piece
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
      // Update ghost position on grid, centered on the piece
      const gridPos = this.renderer.screenToGrid(screenX, screenY);
      if (gridPos) {
        const piece = this.pieceQueue[this.selectedPieceIndex];
        const center = getPieceCenter(piece.shape);

        // Adjust position so piece centers on tap
        const centeredRow = gridPos.row - center.rowOffset;
        const centeredCol = gridPos.col - center.colOffset;

        // Try centered position first, then wiggle to find valid spot
        const finalPos = this.findBestPosition(piece, centeredRow, centeredCol);
        this.ghostPosition = finalPos;
      }
    }
    this.render();
  }

  // Find the best valid position near the target, with wiggle search
  private findBestPosition(
    piece: Piece,
    targetRow: number,
    targetCol: number
  ): { row: number; col: number } {
    // If the exact position is valid, use it
    if (canPlacePiece(this.grid, piece, targetRow, targetCol)) {
      return { row: targetRow, col: targetCol };
    }

    // Wiggle search: try nearby positions in expanding rings
    // Priority: closer positions first, prefer positions that don't move too far
    const maxWiggle = 2;
    let bestPos: { row: number; col: number } | null = null;
    let bestDist = Infinity;

    for (let dist = 1; dist <= maxWiggle; dist++) {
      for (let dr = -dist; dr <= dist; dr++) {
        for (let dc = -dist; dc <= dist; dc++) {
          // Only check positions at exactly this distance (ring, not filled square)
          if (Math.abs(dr) !== dist && Math.abs(dc) !== dist) continue;

          const r = targetRow + dr;
          const c = targetCol + dc;

          if (canPlacePiece(this.grid, piece, r, c)) {
            const actualDist = Math.abs(dr) + Math.abs(dc);
            if (actualDist < bestDist) {
              bestDist = actualDist;
              bestPos = { row: r, col: c };
            }
          }
        }
      }

      // If we found a valid position at this distance, use it
      if (bestPos) {
        return bestPos;
      }
    }

    // No valid position found nearby, just return the original (will show as invalid)
    return { row: targetRow, col: targetCol };
  }

  private tryPlacePiece() {
    if (!this.ghostPosition) return;

    const piece = this.pieceQueue[this.selectedPieceIndex];
    if (!piece) return;

    const { row, col } = this.ghostPosition;

    if (!canPlacePiece(this.grid, piece, row, col)) {
      return;
    }

    const result = placePiece(this.grid, piece, row, col);

    if (result.success) {
      // Calculate score
      const hasBursts = result.bursts.length > 0;
      if (hasBursts) {
        this.comboMultiplier += 0.5;
      } else {
        this.comboMultiplier = 1;
      }

      const points = calculateScore(
        result.placedTiles.length,
        result.bursts,
        this.comboMultiplier
      );
      this.score += points;
      this.api.setScore(this.score);

      // Add burst animations, particles, and floating text
      if (result.bursts.length > 0) {
        const allTiles: [number, number][] = [];
        const allColors: (string | null)[] = [];

        // Collect tiles and their colors before they're cleared
        for (const burst of result.bursts) {
          for (const tile of burst.clearedTiles) {
            allTiles.push(tile);
            // Use the piece color for the particles
            allColors.push(piece.color);
          }
        }

        this.burstAnimations.push({
          tiles: allTiles,
          startTime: performance.now(),
          duration: BURST_DURATION,
        });

        // Generate particles for each cleared tile
        const cellSize = this.renderer.getCellSize();
        const { x: gridOffsetX, y: gridOffsetY } = this.renderer.getGridOffset();

        const newParticles = generateParticles(
          allTiles,
          allColors,
          cellSize,
          gridOffsetX,
          gridOffsetY
        );
        this.particles.push(...newParticles);

        // Calculate center of burst for floating text
        let sumX = 0, sumY = 0;
        for (const [r, c] of allTiles) {
          sumX += gridOffsetX + c * cellSize + cellSize / 2;
          sumY += gridOffsetY + r * cellSize + cellSize / 2;
        }
        const centerX = sumX / allTiles.length;
        const centerY = sumY / allTiles.length;

        // Generate floating texts
        const newTexts = generateFloatingTexts(centerX, centerY, points, allTiles.length);
        this.floatingTexts.push(...newTexts);

        this.api.haptics.success();
        this.api.sounds.burst();
        if (result.bursts.length > 1) {
          this.api.sounds.combo(this.comboMultiplier);
        }
      } else {
        this.api.haptics.tap();
        this.api.sounds.place();
      }

      // Replace used piece
      this.pieceQueue[this.selectedPieceIndex] = generateRandomPiece();

      // Check for game over
      if (isGameOver(this.grid, this.pieceQueue)) {
        this.triggerDefeat();
      }
    }
  }

  private triggerDefeat() {
    this.defeatAnimation = createDefeatAnimation();

    // Generate particles from all filled cells
    const cellSize = this.renderer.getCellSize();
    const { x: gridOffsetX, y: gridOffsetY } = this.renderer.getGridOffset();
    const cells: { x: number; y: number; color: string }[] = [];

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = this.grid[r][c];
        if (cell.filled && cell.color) {
          cells.push({
            x: gridOffsetX + c * cellSize + cellSize / 2,
            y: gridOffsetY + r * cellSize + cellSize / 2,
            color: cell.color,
          });
        }
      }
    }
    this.particles.push(...generateDefeatParticles(cells));

    this.render();
  }

  private render = () => {
    if (this.isDestroyed) return;

    // Check if defeat animation is complete
    if (this.defeatAnimation && isDefeatComplete(this.defeatAnimation)) {
      this.api.gameOver(this.score);
      return;
    }

    // Clean up expired animations, particles, and floating texts
    const now = performance.now();
    this.burstAnimations = this.burstAnimations.filter(
      (a) => now - a.startTime < a.duration
    );
    this.particles = this.particles.filter(
      (p) => now - p.startTime < p.duration
    );
    this.floatingTexts = this.floatingTexts.filter(
      (ft) => now - ft.startTime < ft.duration
    );

    const settings = this.api.getSettings();

    const state: RenderState = {
      grid: this.grid,
      ghostPiece: this.ghostPosition
        ? {
            piece: this.pieceQueue[this.selectedPieceIndex],
            row: this.ghostPosition.row,
            col: this.ghostPosition.col,
            valid: canPlacePiece(
              this.grid,
              this.pieceQueue[this.selectedPieceIndex],
              this.ghostPosition.row,
              this.ghostPosition.col
            ),
          }
        : null,
      burstAnimations: this.burstAnimations,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      reduceMotion: settings.reduceMotion,
      defeatAnimation: this.defeatAnimation,
    };

    this.renderer.render(state);
    this.renderer.drawPieceQueue(this.pieceQueue, this.selectedPieceIndex);

    // Continue animation loop if there are active animations
    const hasActiveEffects =
      this.burstAnimations.length > 0 ||
      this.particles.length > 0 ||
      this.floatingTexts.length > 0 ||
      this.defeatAnimation !== null;

    if (hasActiveEffects && !this.isPaused) {
      this.animationFrameId = requestAnimationFrame(this.render);
    }
  };

  start() {
    this.grid = createEmptyGrid();
    this.pieceQueue = Array.from({ length: QUEUE_SIZE }, () => generateRandomPiece());
    this.selectedPieceIndex = 0;
    this.score = 0;
    this.comboMultiplier = 1;
    this.burstAnimations = [];
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
  }

  reset() {
    this.start();
  }

  destroy() {
    this.isDestroyed = true;
    this.removeEventListeners();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.settingsUnsub) {
      this.settingsUnsub();
    }
    this.renderer.destroy();
  }
}
