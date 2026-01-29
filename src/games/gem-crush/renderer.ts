// Gem Crush Renderer Utilities

import { Gem, GRID_COLS, GRID_ROWS, GEM_COLORS } from './types';

// Safe arc helper that prevents negative radius errors
function safeArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
): void {
  if (radius > 0) {
    ctx.arc(x, y, radius, startAngle, endAngle);
  }
}

// Draw a single gem with all its visual effects
export function drawGem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  gem: Gem,
  isSelected: boolean = false,
  isHinted: boolean = false,
  hintPulse: number = 0
): void {
  const padding = size * 0.08;
  const gemSize = size - padding * 2;
  const centerX = x + size / 2;
  const centerY = y + size / 2 + gem.offsetY;
  const scale = Math.max(0, gem.scale);
  const radius = (gemSize / 2) * scale;

  // Don't draw if radius is too small
  if (radius < 2) return;

  ctx.save();

  // Apply shake offset
  if (gem.shake > 0) {
    const shakeOffset = Math.sin(gem.shake * 30) * 3 * gem.shake;
    ctx.translate(shakeOffset, 0);
  }

  // Selection glow
  if (isSelected) {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 15;
  }

  // Hint pulse glow
  if (isHinted) {
    const pulseIntensity = 0.5 + Math.sin(hintPulse * Math.PI * 2) * 0.5;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 10 + pulseIntensity * 10;
  }

  // Draw based on gem type
  switch (gem.type) {
    case 'normal':
      drawNormalGem(ctx, centerX, centerY, radius, gem.color);
      break;
    case 'line_h':
      drawLineBlasterGem(ctx, centerX, centerY, radius, gem.color, true);
      break;
    case 'line_v':
      drawLineBlasterGem(ctx, centerX, centerY, radius, gem.color, false);
      break;
    case 'bomb':
      drawBombGem(ctx, centerX, centerY, radius, gem.color);
      break;
    case 'rainbow':
      drawRainbowGem(ctx, centerX, centerY, radius);
      break;
  }

  ctx.restore();
}

function drawNormalGem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  if (radius < 2) return;

  // Main gem body with gradient
  const gradient = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.3,
    0,
    x,
    y,
    radius
  );
  gradient.addColorStop(0, lightenColor(color, 40));
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, darkenColor(color, 30));

  ctx.beginPath();
  safeArc(ctx, x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Inner highlight
  const highlightRadius = radius * 0.35;
  if (highlightRadius > 0) {
    ctx.beginPath();
    safeArc(ctx, x - radius * 0.25, y - radius * 0.25, highlightRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, 0.4)`;
    ctx.fill();
  }

  // Subtle rim
  const rimRadius = Math.max(0, radius - 1);
  if (rimRadius > 0) {
    ctx.beginPath();
    safeArc(ctx, x, y, rimRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, 0.2)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawLineBlasterGem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  isHorizontal: boolean
): void {
  if (radius < 2) return;

  // Base gem
  drawNormalGem(ctx, x, y, radius, color);

  // Stripe pattern
  const clipRadius = Math.max(0, radius - 2);
  if (clipRadius > 0) {
    ctx.save();
    ctx.beginPath();
    safeArc(ctx, x, y, clipRadius, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;

    if (isHorizontal) {
      // Horizontal stripes
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x - radius, y + i * 6);
        ctx.lineTo(x + radius, y + i * 6);
        ctx.stroke();
      }
    } else {
      // Vertical stripes
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 6, y - radius);
        ctx.lineTo(x + i * 6, y + radius);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // Arrow indicators
  ctx.fillStyle = '#ffffff';
  const arrowSize = radius * 0.3;

  if (isHorizontal) {
    // Left arrow
    drawArrow(ctx, x - radius * 0.5, y, arrowSize, 'left');
    // Right arrow
    drawArrow(ctx, x + radius * 0.5, y, arrowSize, 'right');
  } else {
    // Up arrow
    drawArrow(ctx, x, y - radius * 0.5, arrowSize, 'up');
    // Down arrow
    drawArrow(ctx, x, y + radius * 0.5, arrowSize, 'down');
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  direction: 'left' | 'right' | 'up' | 'down'
): void {
  if (size < 1) return;

  ctx.save();
  ctx.translate(x, y);

  switch (direction) {
    case 'right':
      ctx.rotate(0);
      break;
    case 'down':
      ctx.rotate(Math.PI / 2);
      break;
    case 'left':
      ctx.rotate(Math.PI);
      break;
    case 'up':
      ctx.rotate(-Math.PI / 2);
      break;
  }

  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.5, -size * 0.6);
  ctx.lineTo(-size * 0.5, size * 0.6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawBombGem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  if (radius < 2) return;

  // Base gem with darker center
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, darkenColor(color, 20));
  gradient.addColorStop(0.6, color);
  gradient.addColorStop(1, darkenColor(color, 40));

  ctx.beginPath();
  safeArc(ctx, x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Explosive star pattern
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 2;

  const spikes = 8;
  for (let i = 0; i < spikes; i++) {
    const angle = (i / spikes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * radius * 0.7, Math.sin(angle) * radius * 0.7);
    ctx.stroke();
  }

  ctx.restore();

  // Center dot
  const centerRadius = radius * 0.2;
  if (centerRadius > 0) {
    ctx.beginPath();
    safeArc(ctx, x, y, centerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Pulsing ring
  const ringRadius = radius * 0.85;
  if (ringRadius > 0) {
    ctx.beginPath();
    safeArc(ctx, x, y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawRainbowGem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
): void {
  if (radius < 2) return;

  // Rainbow gradient background
  const gradient = ctx.createConicGradient(0, x, y);
  GEM_COLORS.forEach((color, i) => {
    gradient.addColorStop(i / GEM_COLORS.length, color);
  });
  gradient.addColorStop(1, GEM_COLORS[0]);

  ctx.beginPath();
  safeArc(ctx, x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // White inner glow
  const innerGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
  innerGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)');
  innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.beginPath();
  safeArc(ctx, x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = innerGradient;
  ctx.fill();

  // Star sparkle
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffffff';

  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i / 4) * Math.PI * 2 + Math.PI / 8);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.15);
    ctx.lineTo(radius * 0.5, 0);
    ctx.lineTo(0, radius * 0.15);
    ctx.lineTo(-radius * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // Outer sparkle ring
  const outerRingRadius = Math.max(0, radius - 2);
  if (outerRingRadius > 0) {
    ctx.beginPath();
    safeArc(ctx, x, y, outerRingRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Draw grid background
export function drawGridBackground(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  cellSize: number
): void {
  const gridWidth = cellSize * GRID_COLS;
  const gridHeight = cellSize * GRID_ROWS;

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.roundRect(offsetX - 4, offsetY - 4, gridWidth + 8, gridHeight + 8, 8);
  ctx.fill();

  // Checkerboard pattern
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const x = offsetX + col * cellSize;
      const y = offsetY + row * cellSize;
      const isLight = (row + col) % 2 === 0;

      ctx.fillStyle = isLight ? '#252545' : '#1e1e3a';
      ctx.fillRect(x, y, cellSize, cellSize);
    }
  }

  // Grid border
  ctx.strokeStyle = '#3a3a5c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(offsetX - 2, offsetY - 2, gridWidth + 4, gridHeight + 4, 6);
  ctx.stroke();
}

// Color manipulation utilities
function lightenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
}

function darkenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
  const B = Math.max(0, (num & 0x0000ff) - amt);
  return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
}

// Draw swap animation between two gems
export function drawSwapAnimation(
  ctx: CanvasRenderingContext2D,
  gem1: Gem,
  gem2: Gem,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cellSize: number,
  progress: number
): void {
  // Ease out cubic
  const eased = 1 - Math.pow(1 - progress, 3);

  const currentX1 = x1 + (x2 - x1) * eased;
  const currentY1 = y1 + (y2 - y1) * eased;
  const currentX2 = x2 + (x1 - x2) * eased;
  const currentY2 = y2 + (y1 - y2) * eased;

  drawGem(ctx, currentX1, currentY1, cellSize, gem1);
  drawGem(ctx, currentX2, currentY2, cellSize, gem2);
}

// Draw line blaster activation effect
export function drawLineBlasterEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number,
  isHorizontal: boolean,
  progress: number,
  gridOffsetX: number,
  gridOffsetY: number
): void {
  const gridWidth = cellSize * GRID_COLS;
  const gridHeight = cellSize * GRID_ROWS;

  ctx.save();

  const alpha = Math.max(0, 1 - progress);
  const width = isHorizontal ? gridWidth : cellSize * 0.8;
  const height = isHorizontal ? cellSize * 0.8 : gridHeight;

  const startX = isHorizontal ? gridOffsetX : x + cellSize * 0.1;
  const startY = isHorizontal ? y + cellSize * 0.1 : gridOffsetY;

  // Glow effect
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 20 * alpha;

  ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * alpha})`;
  ctx.fillRect(startX, startY, width, height);

  ctx.restore();
}

// Draw bomb explosion effect
export function drawBombEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number,
  progress: number
): void {
  ctx.save();

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const maxRadius = cellSize * 2;
  const currentRadius = maxRadius * clampedProgress;
  const alpha = Math.max(0, 1 - clampedProgress);

  // Shockwave ring
  if (currentRadius > 0) {
    ctx.beginPath();
    safeArc(ctx, x + cellSize / 2, y + cellSize / 2, currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 200, 100, ${alpha})`;
    ctx.lineWidth = Math.max(0.5, 8 * (1 - clampedProgress));
    ctx.stroke();
  }

  // Inner flash
  const flashRadius = Math.max(0, maxRadius * 0.5 * (1 - clampedProgress));
  if (flashRadius > 0) {
    const gradient = ctx.createRadialGradient(
      x + cellSize / 2,
      y + cellSize / 2,
      0,
      x + cellSize / 2,
      y + cellSize / 2,
      flashRadius
    );
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
    gradient.addColorStop(1, `rgba(255, 200, 100, 0)`);

    ctx.beginPath();
    safeArc(ctx, x + cellSize / 2, y + cellSize / 2, flashRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.restore();
}

// Draw rainbow activation effect
export function drawRainbowEffect(
  ctx: CanvasRenderingContext2D,
  positions: { x: number; y: number }[],
  progress: number,
  cellSize: number
): void {
  ctx.save();

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const alpha = Math.max(0, 1 - clampedProgress);
  const scale = 0.5 + clampedProgress * 0.5;

  for (const pos of positions) {
    const radius = Math.max(0, (cellSize / 2) * scale);

    if (radius > 0) {
      ctx.beginPath();
      safeArc(ctx, pos.x + cellSize / 2, pos.y + cellSize / 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
      ctx.fill();
    }
  }

  ctx.restore();
}
