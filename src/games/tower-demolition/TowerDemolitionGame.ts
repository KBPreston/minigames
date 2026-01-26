import type { GameAPI, GameInstance } from '../../core/types';
import {
  Block,
  Explosion,
  BLOCK_PROPERTIES,
  DYNAMITE_COUNT,
  EXPLOSION_RADIUS,
  EXPLOSION_FORCE,
  EXPLOSION_DURATION,
} from './types';
import { updatePhysics, applyExplosion, allBlocksSettled, PhysicsWorld } from './physics';
import { generateTower, getActiveBlockCount, isTowerCleared } from './towers';
import {
  Particle,
  FloatingText,
  generateParticlesAt,
  createFloatingText,
  drawParticles,
  drawFloatingTexts,
  filterActiveParticles,
  filterActiveFloatingTexts,
  hasActiveEffects,
} from '../../core/effects';

export class TowerDemolitionGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private blocks: Block[] = [];
  private explosions: Explosion[] = [];
  private dynamiteRemaining: number = DYNAMITE_COUNT;
  private level: number = 1;
  private score: number = 0;
  private initialBlockCount: number = 0;

  private world: PhysicsWorld = { groundY: 0, leftWall: 0, rightWall: 0 };
  private centerX: number = 0;

  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private isGameOver: boolean = false;
  private waitingForSettle: boolean = false;
  private lastTime: number = 0;
  private animationFrameId: number = 0;

  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private lastTouchTime: number = 0; // Prevent duplicate touch/click events

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

    const padding = 20;
    this.world = {
      groundY: rect.height - 80,
      leftWall: padding,
      rightWall: rect.width - padding,
    };
    this.centerX = rect.width / 2;

    this.render();
  };

  private setupEventListeners() {
    this.container.addEventListener('touchstart', this.handleTouch, { passive: false });
    this.container.addEventListener('click', this.handleClick);
  }

  private removeEventListeners() {
    this.container.removeEventListener('touchstart', this.handleTouch);
    this.container.removeEventListener('click', this.handleClick);
  }

  private handleTouch = (e: TouchEvent) => {
    if (this.isPaused || this.isGameOver) return;
    e.preventDefault();
    this.lastTouchTime = Date.now();
    const touch = e.touches[0];
    const rect = this.container.getBoundingClientRect();
    this.placeDynamite(touch.clientX - rect.left, touch.clientY - rect.top);
  };

  private handleClick = (e: MouseEvent) => {
    if (this.isPaused || this.isGameOver) return;
    // Ignore click if it's a ghost click from touch (within 500ms)
    if (Date.now() - this.lastTouchTime < 500) return;
    const rect = this.container.getBoundingClientRect();
    this.placeDynamite(e.clientX - rect.left, e.clientY - rect.top);
  };

  private placeDynamite(x: number, y: number) {
    if (this.dynamiteRemaining <= 0) return;
    if (this.waitingForSettle) return;

    // Check if clicking near a block
    const nearBlock = this.blocks.some(block => {
      if (block.destroyed) return false;
      const dx = x - (block.x + block.width / 2);
      const dy = y - (block.y + block.height / 2);
      return Math.sqrt(dx * dx + dy * dy) < EXPLOSION_RADIUS * 1.5;
    });

    if (!nearBlock && y < this.world.groundY - 20) {
      // Show hint that they need to click near blocks
      this.floatingTexts.push(createFloatingText(x, y, 'Click near tower!', '#f87171', 14));
      this.api.sounds.invalid();
      return;
    }

    this.dynamiteRemaining--;
    this.waitingForSettle = true;

    // Create explosion
    const explosion: Explosion = {
      x,
      y,
      radius: 0,
      maxRadius: EXPLOSION_RADIUS,
      active: true,
      startTime: performance.now(),
    };
    this.explosions.push(explosion);

    // Apply explosion physics
    const destroyed = applyExplosion(this.blocks, x, y, EXPLOSION_RADIUS, EXPLOSION_FORCE);

    // Score based on blocks destroyed
    if (destroyed.length > 0) {
      // Base points + multiplier for multiple blocks
      const multiplier = Math.max(1, destroyed.length * 0.5);
      const points = Math.floor(destroyed.length * 50 * multiplier * this.level);
      this.score += points;
      this.api.setScore(this.score);

      // Create effects for each destroyed block
      for (const block of destroyed) {
        const cx = block.x + block.width / 2;
        const cy = block.y + block.height / 2;
        const color = BLOCK_PROPERTIES[block.type].color;
        this.particles.push(...generateParticlesAt(cx, cy, color, 10));
      }

      // Show combo message
      if (destroyed.length >= 5) {
        this.floatingTexts.push(createFloatingText(x, y - 30, `MASSIVE! ${destroyed.length} blocks!`, '#f97316', 24));
        this.api.sounds.combo(destroyed.length);
        this.api.haptics.success();
      } else if (destroyed.length >= 3) {
        this.floatingTexts.push(createFloatingText(x, y - 20, `GREAT! ${destroyed.length}x`, '#eab308', 20));
        this.api.sounds.clearMulti(destroyed.length);
        this.api.haptics.success();
      } else {
        this.floatingTexts.push(createFloatingText(x, y, `+${points}`, '#fbbf24', 16));
        this.api.sounds.burst();
        this.api.haptics.tap();
      }
    } else {
      this.floatingTexts.push(createFloatingText(x, y, 'Miss!', '#f87171', 14));
      this.api.sounds.burst();
      this.api.haptics.tap();
    }

    // Explosion particles
    this.particles.push(...generateParticlesAt(x, y, '#f97316', 20));
    this.particles.push(...generateParticlesAt(x, y, '#fbbf24', 15));

    this.startGameLoop();
  }

  private startGameLoop() {
    if (this.animationFrameId) return;
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  }

  private gameLoop = (time: number) => {
    if (this.isDestroyed || this.isPaused) {
      this.animationFrameId = 0;
      return;
    }

    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    // Update physics
    updatePhysics(this.blocks, dt, this.world);

    // Update explosions
    for (const explosion of this.explosions) {
      if (!explosion.active) continue;
      const elapsed = time - explosion.startTime;
      explosion.radius = (elapsed / EXPLOSION_DURATION) * explosion.maxRadius;
      if (elapsed >= EXPLOSION_DURATION) {
        explosion.active = false;
      }
    }

    // Filter effects
    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);

    // Check if blocks have settled
    if (this.waitingForSettle && allBlocksSettled(this.blocks)) {
      this.waitingForSettle = false;

      // Check tower cleared
      if (isTowerCleared(this.blocks, this.initialBlockCount)) {
        this.nextLevel();
      } else if (this.dynamiteRemaining <= 0) {
        // Out of dynamite and tower not cleared
        this.triggerGameOver();
      }
    }

    this.render();

    // Continue loop if physics active or effects playing
    const physicsActive = !allBlocksSettled(this.blocks) || this.explosions.some(e => e.active);
    if (physicsActive || hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animationFrameId = requestAnimationFrame(this.gameLoop);
    } else {
      this.animationFrameId = 0;
    }
  };

  private nextLevel() {
    this.level++;

    // Bonus for remaining dynamite
    const dynamiteBonus = this.dynamiteRemaining * 100 * this.level;
    if (dynamiteBonus > 0) {
      this.score += dynamiteBonus;
      this.api.setScore(this.score);

      const rect = this.container.getBoundingClientRect();
      this.floatingTexts.push(
        createFloatingText(rect.width / 2, rect.height / 2 + 40, `+${dynamiteBonus} dynamite bonus!`, '#22c55e', 18)
      );
    }

    // Level complete message
    const rect = this.container.getBoundingClientRect();
    this.floatingTexts.push(
      createFloatingText(rect.width / 2, rect.height / 2, `Level ${this.level}!`, '#22c55e', 32)
    );

    this.api.haptics.success();
    this.api.sounds.roundComplete();

    // Reset for next level
    this.dynamiteRemaining = DYNAMITE_COUNT;
    this.explosions = [];

    // Generate new tower
    const tower = generateTower(this.level, this.world.groundY, this.centerX);
    this.blocks = tower.blocks;
    this.initialBlockCount = this.blocks.length;
  }

  private triggerGameOver() {
    this.isGameOver = true;
    this.api.haptics.tap();

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.api.gameOver(this.score);
      }
    }, 500);
  }

  private render() {
    const rect = this.container.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    this.drawBackground();
    this.drawGround();
    this.drawBlocks();
    this.drawExplosions();
    this.drawHUD();

    // Effects
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(this.ctx, this.particles, reduceMotion);
    drawFloatingTexts(this.ctx, this.floatingTexts, reduceMotion);
  }

  private drawBackground() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    // Sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, '#1e3a5f');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  private drawGround() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    // Ground
    ctx.fillStyle = '#374151';
    ctx.fillRect(0, this.world.groundY, rect.width, rect.height - this.world.groundY);

    // Ground line
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, this.world.groundY);
    ctx.lineTo(rect.width, this.world.groundY);
    ctx.stroke();
  }

  private drawBlocks() {
    const { ctx } = this;

    for (const block of this.blocks) {
      if (block.destroyed) continue;

      const props = BLOCK_PROPERTIES[block.type];

      ctx.save();

      // Apply rotation around block center
      const cx = block.x + block.width / 2;
      const cy = block.y + block.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(block.rotation);
      ctx.translate(-block.width / 2, -block.height / 2);

      // Block fill
      ctx.fillStyle = props.color;
      ctx.fillRect(0, 0, block.width, block.height);

      // Block border
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, block.width, block.height);

      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, 0, block.width, block.height / 3);

      ctx.restore();
    }
  }

  private drawExplosions() {
    const { ctx } = this;

    for (const explosion of this.explosions) {
      if (!explosion.active) continue;

      const alpha = 1 - (explosion.radius / explosion.maxRadius);

      // Outer glow
      ctx.fillStyle = `rgba(249, 115, 22, ${alpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.radius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgba(251, 191, 36, ${alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
      ctx.fill();

      // Center flash
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHUD() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    // Level indicator
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${this.level}`, rect.width / 2, 30);

    // Dynamite remaining
    const dynamiteY = rect.height - 35;
    const dynamiteSpacing = 30;
    const startX = rect.width / 2 - (DYNAMITE_COUNT - 1) * dynamiteSpacing / 2;

    for (let i = 0; i < DYNAMITE_COUNT; i++) {
      const x = startX + i * dynamiteSpacing;
      const available = i < this.dynamiteRemaining;

      // Draw dynamite stick icon
      if (available) {
        // Red stick
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x - 4, dynamiteY - 12, 8, 20);

        // Fuse
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, dynamiteY - 12);
        ctx.lineTo(x + 3, dynamiteY - 18);
        ctx.stroke();

        // Spark
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(x + 3, dynamiteY - 19, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Used dynamite - gray
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(x - 4, dynamiteY - 12, 8, 20);
      }
    }

    // Blocks remaining
    const remaining = getActiveBlockCount(this.blocks);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Blocks: ${remaining}`, 20, 30);

    // Instruction when waiting
    if (!this.waitingForSettle && this.dynamiteRemaining > 0 && !this.isGameOver) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap near tower to place dynamite', rect.width / 2, 50);
    }
  }

  start() {
    this.level = 1;
    this.score = 0;
    this.dynamiteRemaining = DYNAMITE_COUNT;
    this.isGameOver = false;
    this.waitingForSettle = false;
    this.explosions = [];
    this.particles = [];
    this.floatingTexts = [];

    const tower = generateTower(this.level, this.world.groundY, this.centerX);
    this.blocks = tower.blocks;
    this.initialBlockCount = this.blocks.length;

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
    if (!allBlocksSettled(this.blocks) || this.explosions.some(e => e.active)) {
      this.startGameLoop();
    }
    this.render();
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
