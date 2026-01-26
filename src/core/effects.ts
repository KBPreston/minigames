// Shared particle and floating text effects for all games

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

// Generate particles at a specific position
export function generateParticlesAt(
  x: number,
  y: number,
  color: string,
  count: number = 6
): Particle[] {
  const particles: Particle[] = [];
  const now = performance.now();

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 60 + Math.random() * 100;

    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      color,
      size: 3 + Math.random() * 4,
      startTime: now + Math.random() * 30,
      duration: 500 + Math.random() * 300,
    });
  }

  return particles;
}

// Generate particles for multiple cells
export function generateParticlesForCells(
  cells: { x: number; y: number; color: string }[],
  particlesPerCell: number = 5
): Particle[] {
  const particles: Particle[] = [];
  for (const cell of cells) {
    particles.push(...generateParticlesAt(cell.x, cell.y, cell.color, particlesPerCell));
  }
  return particles;
}

// Create floating text
export function createFloatingText(
  x: number,
  y: number,
  text: string,
  color: string,
  fontSize: number = 24
): FloatingText {
  return {
    x,
    y,
    text,
    color,
    fontSize,
    startTime: performance.now(),
    duration: 1200,
  };
}

// Word scoring for Block Blast (lines cleared)
export function getBlockBlastWord(linesCleared: number): { word: string; color: string } {
  if (linesCleared >= 4) return { word: 'INCREDIBLE!', color: '#f472b6' };
  if (linesCleared >= 3) return { word: 'Amazing!', color: '#a78bfa' };
  if (linesCleared >= 2) return { word: 'Great!', color: '#34d399' };
  return { word: 'Nice!', color: '#60a5fa' };
}

// Word scoring for Snap Merge (merged value)
export function getSnapMergeWord(mergedValue: number): { word: string; color: string } {
  if (mergedValue >= 2048) return { word: 'LEGENDARY!', color: '#fbbf24' };
  if (mergedValue >= 1024) return { word: 'INCREDIBLE!', color: '#f472b6' };
  if (mergedValue >= 256) return { word: 'Amazing!', color: '#a78bfa' };
  if (mergedValue >= 64) return { word: 'Great!', color: '#34d399' };
  if (mergedValue >= 16) return { word: 'Nice!', color: '#60a5fa' };
  return { word: '', color: '' }; // No word for small merges
}

// Word scoring for Color Flood (groups cleared or moves bonus)
export function getColorFloodWord(groupsCleared: number): { word: string; color: string } {
  if (groupsCleared >= 4) return { word: 'INCREDIBLE!', color: '#f472b6' };
  if (groupsCleared >= 3) return { word: 'Amazing!', color: '#a78bfa' };
  if (groupsCleared >= 2) return { word: 'Great!', color: '#34d399' };
  return { word: 'Nice!', color: '#60a5fa' };
}

// Draw particles on canvas
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  reduceMotion: boolean
): void {
  if (reduceMotion) return;

  const now = performance.now();

  for (const particle of particles) {
    const elapsed = now - particle.startTime;
    if (elapsed < 0) continue;

    const progress = Math.min(elapsed / particle.duration, 1);
    if (progress >= 1) continue;

    const gravity = 180;
    const t = elapsed / 1000;
    const x = particle.x + particle.vx * t;
    const y = particle.y + particle.vy * t + 0.5 * gravity * t * t;

    const fadeStart = 0.3;
    const alpha = progress < fadeStart ? 1 : 1 - (progress - fadeStart) / (1 - fadeStart);
    const scale = 1 - progress * 0.5;
    const size = particle.size * scale;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // Glow effect
    ctx.globalAlpha = alpha * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// Draw floating texts on canvas
export function drawFloatingTexts(
  ctx: CanvasRenderingContext2D,
  floatingTexts: FloatingText[],
  reduceMotion: boolean
): void {
  const now = performance.now();

  for (const ft of floatingTexts) {
    const elapsed = now - ft.startTime;
    if (elapsed < 0) continue;

    const progress = Math.min(elapsed / ft.duration, 1);
    if (progress >= 1) continue;

    const easeOut = 1 - Math.pow(1 - progress, 3);
    const floatDistance = reduceMotion ? 25 : 50;
    const y = ft.y - easeOut * floatDistance;

    let alpha: number;
    if (progress < 0.15) {
      alpha = progress / 0.15;
    } else if (progress > 0.7) {
      alpha = (1 - progress) / 0.3;
    } else {
      alpha = 1;
    }

    let scale = 1;
    if (!reduceMotion && progress < 0.12) {
      scale = 0.5 + (progress / 0.12) * 0.7;
      if (progress > 0.08) {
        scale = 1.2 - ((progress - 0.08) / 0.04) * 0.2;
      }
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.font = `bold ${Math.round(ft.fontSize * scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeText(ft.text, ft.x, y);
    ctx.fillText(ft.text, ft.x, y);
  }

  ctx.globalAlpha = 1;
}

// Filter out expired effects
export function filterActiveParticles(particles: Particle[]): Particle[] {
  const now = performance.now();
  return particles.filter(p => now - p.startTime < p.duration);
}

export function filterActiveFloatingTexts(texts: FloatingText[]): FloatingText[] {
  const now = performance.now();
  return texts.filter(ft => now - ft.startTime < ft.duration);
}

// Check if there are active effects
export function hasActiveEffects(particles: Particle[], floatingTexts: FloatingText[]): boolean {
  const now = performance.now();
  const hasParticles = particles.some(p => now - p.startTime < p.duration);
  const hasTexts = floatingTexts.some(ft => now - ft.startTime < ft.duration);
  return hasParticles || hasTexts;
}

// Defeat animation state
export interface DefeatAnimation {
  startTime: number;
  duration: number;
  phase: 'shake' | 'explode' | 'fade';
}

export function createDefeatAnimation(): DefeatAnimation {
  return {
    startTime: performance.now(),
    duration: 1500,
    phase: 'shake',
  };
}

// Generate explosion particles for defeat
export function generateDefeatParticles(
  cells: { x: number; y: number; color: string }[],
  stagger: boolean = true
): Particle[] {
  const particles: Particle[] = [];
  const now = performance.now();

  for (let i = 0; i < cells.length; i++) {
    const { x, y, color } = cells[i];
    const delay = stagger ? i * 15 : 0;

    // Create 3-5 particles per cell
    const count = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < count; j++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 150;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        color,
        size: 4 + Math.random() * 4,
        startTime: now + delay,
        duration: 800 + Math.random() * 400,
      });
    }
  }

  return particles;
}

// Draw screen shake effect
export function getShakeOffset(defeat: DefeatAnimation | null): { x: number; y: number } {
  if (!defeat) return { x: 0, y: 0 };

  const elapsed = performance.now() - defeat.startTime;
  const shakePhase = 300; // First 300ms is shake

  if (elapsed > shakePhase) return { x: 0, y: 0 };

  const intensity = 8 * (1 - elapsed / shakePhase);
  return {
    x: (Math.random() - 0.5) * intensity * 2,
    y: (Math.random() - 0.5) * intensity * 2,
  };
}

// Draw defeat overlay (red flash and fade)
export function drawDefeatOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  defeat: DefeatAnimation | null
): void {
  if (!defeat) return;

  const elapsed = performance.now() - defeat.startTime;
  const progress = Math.min(elapsed / defeat.duration, 1);

  // Red flash at start
  if (progress < 0.2) {
    const flashAlpha = 0.3 * (1 - progress / 0.2);
    ctx.fillStyle = `rgba(239, 68, 68, ${flashAlpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  // "GAME OVER" text
  if (progress > 0.15 && progress < 0.9) {
    const textProgress = (progress - 0.15) / 0.75;
    const scale = textProgress < 0.2 ? 0.5 + textProgress * 2.5 : 1;
    const alpha = textProgress > 0.8 ? (1 - textProgress) / 0.2 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ef4444';
    ctx.font = `bold ${Math.round(48 * scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillText('GAME OVER', width / 2, height / 2);
    ctx.restore();
  }
}

// Check if defeat animation is complete
export function isDefeatComplete(defeat: DefeatAnimation | null): boolean {
  if (!defeat) return true;
  return performance.now() - defeat.startTime >= defeat.duration;
}
