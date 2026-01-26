import type { Grid } from './logic';
import type { Piece } from './pieces';
import { GRID_SIZE } from './logic';
import {
  DefeatAnimation,
  getShakeOffset,
  drawDefeatOverlay,
} from '../../core/effects';

export interface RenderState {
  grid: Grid;
  ghostPiece: { piece: Piece; row: number; col: number; valid: boolean } | null;
  burstAnimations: BurstAnimation[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  reduceMotion: boolean;
  defeatAnimation: DefeatAnimation | null;
}

export interface BurstAnimation {
  tiles: [number, number][];
  startTime: number;
  duration: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  startTime: number;
  duration: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  startTime: number;
  duration: number;
}

// Celebratory words based on tiles cleared
export function getCelebratoryWord(tilesCleared: number): { word: string; color: string } {
  if (tilesCleared >= 40) return { word: 'LEGENDARY!', color: '#fbbf24' };
  if (tilesCleared >= 30) return { word: 'INCREDIBLE!', color: '#f472b6' };
  if (tilesCleared >= 20) return { word: 'Amazing!', color: '#a78bfa' };
  if (tilesCleared >= 14) return { word: 'Great!', color: '#34d399' };
  return { word: 'Nice!', color: '#60a5fa' };
}

// Generate particles for burst effect
export function generateParticles(
  tiles: [number, number][],
  colors: (string | null)[],
  cellSize: number,
  gridOffsetX: number,
  gridOffsetY: number
): Particle[] {
  const particles: Particle[] = [];
  const now = performance.now();

  for (let i = 0; i < tiles.length; i++) {
    const [row, col] = tiles[i];
    const color = colors[i] || '#fbbf24';
    const centerX = gridOffsetX + col * cellSize + cellSize / 2;
    const centerY = gridOffsetY + row * cellSize + cellSize / 2;

    // Create 4-8 particles per tile
    const particleCount = 4 + Math.floor(Math.random() * 5);
    for (let j = 0; j < particleCount; j++) {
      const angle = (Math.PI * 2 * j) / particleCount + Math.random() * 0.5;
      const speed = 80 + Math.random() * 120;

      particles.push({
        x: centerX + (Math.random() - 0.5) * cellSize * 0.5,
        y: centerY + (Math.random() - 0.5) * cellSize * 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50, // Bias upward
        color,
        size: 3 + Math.random() * 5,
        startTime: now + Math.random() * 50, // Slight stagger
        duration: 600 + Math.random() * 400,
      });
    }
  }

  return particles;
}

// Generate floating text for score and celebratory word
export function generateFloatingTexts(
  centerX: number,
  centerY: number,
  points: number,
  tilesCleared: number
): FloatingText[] {
  const now = performance.now();
  const texts: FloatingText[] = [];
  const { word, color } = getCelebratoryWord(tilesCleared);

  // Points text
  texts.push({
    x: centerX,
    y: centerY - 20,
    text: `+${points}`,
    color: '#fbbf24',
    fontSize: 24,
    startTime: now,
    duration: 1200,
  });

  // Celebratory word
  texts.push({
    x: centerX,
    y: centerY - 50,
    text: word,
    color,
    fontSize: tilesCleared >= 30 ? 32 : tilesCleared >= 20 ? 28 : 22,
    startTime: now + 100,
    duration: 1400,
  });

  return texts;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cellSize: number = 0;
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;
  private padding: number = 16;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = () => {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = rect.height;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;

    this.ctx.scale(dpr, dpr);

    // Calculate cell size to fit grid in available space
    const availableWidth = width - this.padding * 2;
    const availableHeight = height - this.padding * 2 - 120; // Reserve space for piece queue

    this.cellSize = Math.floor(Math.min(availableWidth / GRID_SIZE, availableHeight / GRID_SIZE));

    const gridWidth = this.cellSize * GRID_SIZE;

    this.gridOffsetX = (width - gridWidth) / 2;
    this.gridOffsetY = this.padding;
  };

  getCellSize(): number {
    return this.cellSize;
  }

  getGridOffset(): { x: number; y: number } {
    return { x: this.gridOffsetX, y: this.gridOffsetY };
  }

  screenToGrid(screenX: number, screenY: number): { row: number; col: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = screenX - rect.left - this.gridOffsetX;
    const y = screenY - rect.top - this.gridOffsetY;

    if (x < 0 || y < 0) return null;

    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);

    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;

    return { row, col };
  }

  render(state: RenderState) {
    const { width, height } = this.canvas.parentElement!.getBoundingClientRect();
    const shake = getShakeOffset(state.defeatAnimation);

    this.ctx.clearRect(0, 0, width, height);

    // Apply shake via translate
    this.ctx.save();
    this.ctx.translate(shake.x, shake.y);

    this.drawGrid(state.grid);
    this.drawGhost(state.ghostPiece);
    this.drawBurstAnimations(state.burstAnimations, state.reduceMotion);

    this.ctx.restore();

    this.drawParticles(state.particles, state.reduceMotion);
    this.drawFloatingTexts(state.floatingTexts, state.reduceMotion);

    // Draw defeat overlay
    drawDefeatOverlay(this.ctx, width, height, state.defeatAnimation);
  }

  private drawGrid(grid: Grid) {
    const { ctx, cellSize, gridOffsetX, gridOffsetY } = this;

    // Draw background
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(
      gridOffsetX,
      gridOffsetY,
      cellSize * GRID_SIZE,
      cellSize * GRID_SIZE
    );

    // Draw grid lines
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;

    for (let i = 0; i <= GRID_SIZE; i++) {
      const x = gridOffsetX + i * cellSize;
      const y = gridOffsetY + i * cellSize;

      ctx.beginPath();
      ctx.moveTo(x, gridOffsetY);
      ctx.lineTo(x, gridOffsetY + cellSize * GRID_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(gridOffsetX, y);
      ctx.lineTo(gridOffsetX + cellSize * GRID_SIZE, y);
      ctx.stroke();
    }

    // Draw filled cells
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = grid[row][col];
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
    const padding = 2;

    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(
      x + padding,
      y + padding,
      cellSize - padding * 2,
      cellSize - padding * 2,
      4
    );
    ctx.fill();

    // Add subtle highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect(
      x + padding,
      y + padding,
      cellSize - padding * 2,
      (cellSize - padding * 2) * 0.4,
      [4, 4, 0, 0]
    );
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  private drawGhost(ghost: RenderState['ghostPiece']) {
    if (!ghost) return;

    const opacity = ghost.valid ? 0.5 : 0.25;
    const color = ghost.valid ? ghost.piece.color : '#ef4444';

    for (const [dr, dc] of ghost.piece.shape) {
      const row = ghost.row + dr;
      const col = ghost.col + dc;
      if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
        this.drawCell(row, col, color, opacity);
      }
    }
  }

  private drawBurstAnimations(animations: BurstAnimation[], reduceMotion: boolean) {
    const now = performance.now();
    const { ctx, cellSize, gridOffsetX, gridOffsetY } = this;

    for (const anim of animations) {
      const elapsed = now - anim.startTime;
      const progress = Math.min(elapsed / anim.duration, 1);

      if (reduceMotion) {
        // Just fade out
        const opacity = 1 - progress;
        for (const [row, col] of anim.tiles) {
          ctx.globalAlpha = opacity;
          ctx.fillStyle = '#fbbf24';
          const x = gridOffsetX + col * cellSize;
          const y = gridOffsetY + row * cellSize;
          ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        }
      } else {
        // Scale and fade
        const scale = 1 + progress * 0.3;
        const opacity = 1 - progress;

        for (const [row, col] of anim.tiles) {
          ctx.globalAlpha = opacity;
          ctx.fillStyle = '#fbbf24';
          const cx = gridOffsetX + col * cellSize + cellSize / 2;
          const cy = gridOffsetY + row * cellSize + cellSize / 2;
          const size = (cellSize - 4) * scale;

          ctx.beginPath();
          ctx.roundRect(cx - size / 2, cy - size / 2, size, size, 4);
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  private drawParticles(particles: Particle[], reduceMotion: boolean) {
    if (reduceMotion) return; // Skip particles in reduced motion mode

    const now = performance.now();
    const { ctx } = this;

    for (const particle of particles) {
      const elapsed = now - particle.startTime;
      if (elapsed < 0) continue; // Not started yet (staggered)

      const progress = Math.min(elapsed / particle.duration, 1);
      if (progress >= 1) continue;

      // Physics: position with gravity
      const gravity = 200;
      const t = elapsed / 1000;
      const x = particle.x + particle.vx * t;
      const y = particle.y + particle.vy * t + 0.5 * gravity * t * t;

      // Fade out and shrink
      const fadeStart = 0.3;
      const alpha = progress < fadeStart ? 1 : 1 - (progress - fadeStart) / (1 - fadeStart);
      const scale = 1 - progress * 0.5;
      const size = particle.size * scale;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // Add glow effect
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  private drawFloatingTexts(floatingTexts: FloatingText[], reduceMotion: boolean) {
    const now = performance.now();
    const { ctx } = this;

    for (const ft of floatingTexts) {
      const elapsed = now - ft.startTime;
      if (elapsed < 0) continue;

      const progress = Math.min(elapsed / ft.duration, 1);
      if (progress >= 1) continue;

      // Float upward with easing
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const floatDistance = reduceMotion ? 30 : 60;
      const y = ft.y - easeOut * floatDistance;

      // Fade in then out
      let alpha: number;
      if (progress < 0.2) {
        alpha = progress / 0.2; // Fade in
      } else if (progress > 0.7) {
        alpha = (1 - progress) / 0.3; // Fade out
      } else {
        alpha = 1;
      }

      // Scale effect (pop in)
      let scale = 1;
      if (!reduceMotion && progress < 0.15) {
        scale = 0.5 + (progress / 0.15) * 0.7; // Start at 0.5, overshoot to 1.2
        if (progress > 0.1) {
          scale = 1.2 - ((progress - 0.1) / 0.05) * 0.2; // Settle back to 1.0
        }
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${Math.round(ft.fontSize * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Draw shadow/outline for readability
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, y);
      ctx.fillText(ft.text, ft.x, y);
    }

    ctx.globalAlpha = 1;
  }

  drawPieceQueue(pieces: Piece[], selectedIndex: number) {
    const { ctx, cellSize } = this;
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const queueY = this.gridOffsetY + cellSize * GRID_SIZE + 20;
    const pieceSize = Math.min(cellSize * 0.7, 40);
    const spacing = rect.width / (pieces.length + 1);

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const centerX = spacing * (i + 1);
      const isSelected = i === selectedIndex;

      // Draw selection indicator
      if (isSelected) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.beginPath();
        ctx.arc(centerX, queueY + 30, 45, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw piece preview
      const bounds = this.getPieceBounds(piece.shape);
      const pieceWidth = bounds.width * pieceSize;
      const pieceHeight = bounds.height * pieceSize;
      const startX = centerX - pieceWidth / 2;
      const startY = queueY + 30 - pieceHeight / 2;

      for (const [dr, dc] of piece.shape) {
        ctx.fillStyle = piece.color;
        ctx.beginPath();
        ctx.roundRect(
          startX + dc * pieceSize + 2,
          startY + dr * pieceSize + 2,
          pieceSize - 4,
          pieceSize - 4,
          3
        );
        ctx.fill();
      }
    }
  }

  private getPieceBounds(shape: [number, number][]): { width: number; height: number } {
    let maxRow = 0;
    let maxCol = 0;
    for (const [row, col] of shape) {
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
    return { width: maxCol + 1, height: maxRow + 1 };
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}
