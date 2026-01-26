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
import { updatePhysics, applyExplosion, PhysicsWorld } from './physics';
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

enum GameState {
  Ready,
  Aiming,        // Player is holding down, showing preview
  Exploding,
  Settling,
  LevelComplete,
  GameOver,
}

const GROUND_IMPACT_VELOCITY = 200; // Velocity needed to destroy block on ground impact

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

  private gameState: GameState = GameState.Ready;
  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private lastTime: number = 0;
  private animationFrameId: number = 0;

  // Aiming state
  private aimX: number = 0;
  private aimY: number = 0;
  private isValidAim: boolean = false;

  // Settling and combo tracking
  private settleStartTime: number = 0;
  private readonly MAX_SETTLE_TIME = 5000;
  private blocksDestroyedThisTurn: number = 0;
  private currentCombo: number = 0;

  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

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
    this.container.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.container.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
    this.container.addEventListener('mousedown', this.handleMouseDown);
    this.container.addEventListener('mousemove', this.handleMouseMove);
    this.container.addEventListener('mouseup', this.handleMouseUp);
    this.container.addEventListener('mouseleave', this.handleMouseUp);
  }

  private removeEventListeners() {
    this.container.removeEventListener('touchstart', this.handleTouchStart);
    this.container.removeEventListener('touchmove', this.handleTouchMove);
    this.container.removeEventListener('touchend', this.handleTouchEnd);
    this.container.removeEventListener('touchcancel', this.handleTouchEnd);
    this.container.removeEventListener('mousedown', this.handleMouseDown);
    this.container.removeEventListener('mousemove', this.handleMouseMove);
    this.container.removeEventListener('mouseup', this.handleMouseUp);
    this.container.removeEventListener('mouseleave', this.handleMouseUp);
  }

  private getPosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private handleTouchStart = (e: TouchEvent) => {
    if (this.isPaused) return;
    if (this.gameState !== GameState.Ready) return;
    if (this.dynamiteRemaining <= 0) return;
    e.preventDefault();

    const pos = this.getPosition(e.touches[0].clientX, e.touches[0].clientY);
    this.startAiming(pos.x, pos.y);
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (this.gameState !== GameState.Aiming) return;
    e.preventDefault();

    const pos = this.getPosition(e.touches[0].clientX, e.touches[0].clientY);
    this.updateAiming(pos.x, pos.y);
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (this.gameState !== GameState.Aiming) return;
    e.preventDefault();
    this.finishAiming();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isPaused) return;
    if (this.gameState !== GameState.Ready) return;
    if (this.dynamiteRemaining <= 0) return;

    const pos = this.getPosition(e.clientX, e.clientY);
    this.startAiming(pos.x, pos.y);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.gameState !== GameState.Aiming) return;

    const pos = this.getPosition(e.clientX, e.clientY);
    this.updateAiming(pos.x, pos.y);
  };

  private handleMouseUp = () => {
    if (this.gameState !== GameState.Aiming) return;
    this.finishAiming();
  };

  private startAiming(x: number, y: number) {
    this.gameState = GameState.Aiming;
    this.updateAiming(x, y);
    this.api.sounds.select();
  }

  private updateAiming(x: number, y: number) {
    this.aimX = x;
    this.aimY = y;

    // Check if this is a valid placement
    const nearBlock = this.blocks.some(block => {
      if (block.destroyed) return false;
      const dx = x - (block.x + block.width / 2);
      const dy = y - (block.y + block.height / 2);
      return Math.sqrt(dx * dx + dy * dy) < EXPLOSION_RADIUS * 2;
    });

    const nearGround = y > this.world.groundY - 50;
    const nearTowerX = Math.abs(x - this.centerX) < 150;

    this.isValidAim = nearBlock || (nearGround && nearTowerX);
    this.render();
  }

  private finishAiming() {
    if (!this.isValidAim) {
      // Invalid placement - cancel
      this.floatingTexts.push(createFloatingText(this.aimX, this.aimY, 'Place near tower!', '#f87171', 14));
      this.api.sounds.invalid();
      this.gameState = GameState.Ready;
      this.startGameLoop();
      return;
    }

    // Place dynamite!
    this.placeDynamite(this.aimX, this.aimY);
  }

  private placeDynamite(x: number, y: number) {
    this.gameState = GameState.Exploding;
    this.dynamiteRemaining--;
    this.blocksDestroyedThisTurn = 0;
    this.currentCombo = 0;

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

    if (destroyed.length > 0) {
      this.awardPoints(destroyed.length, x, y, true);
    }

    // Explosion particles
    this.particles.push(...generateParticlesAt(x, y, '#f97316', 25));
    this.particles.push(...generateParticlesAt(x, y, '#fbbf24', 20));
    this.particles.push(...generateParticlesAt(x, y, '#ffffff', 10));

    this.api.sounds.burst();
    this.api.haptics.success();
    this.startGameLoop();
  }

  private awardPoints(blocksDestroyed: number, x: number, y: number, isExplosion: boolean) {
    this.blocksDestroyedThisTurn += blocksDestroyed;
    this.currentCombo += blocksDestroyed;

    // Calculate multiplier based on combo
    const multiplier = 1 + (this.currentCombo - 1) * 0.25;
    const basePoints = isExplosion ? 50 : 25; // Less for physics kills
    const points = Math.floor(blocksDestroyed * basePoints * multiplier * this.level);

    this.score += points;
    this.api.setScore(this.score);

    // Visual feedback
    const color = this.currentCombo >= 10 ? '#f97316' :
                  this.currentCombo >= 5 ? '#eab308' : '#fbbf24';
    const size = Math.min(14 + this.currentCombo, 28);

    if (this.currentCombo >= 5) {
      this.floatingTexts.push(createFloatingText(x, y - 20, `${this.currentCombo}x COMBO!`, color, size));
      this.floatingTexts.push(createFloatingText(x, y + 5, `+${points}`, '#fbbf24', 16));
      this.api.sounds.combo(this.currentCombo);
    } else if (this.currentCombo >= 3) {
      this.floatingTexts.push(createFloatingText(x, y - 10, `${this.currentCombo}x`, color, size));
      this.floatingTexts.push(createFloatingText(x, y + 10, `+${points}`, '#fbbf24', 14));
      this.api.sounds.clearMulti(blocksDestroyed);
    } else {
      this.floatingTexts.push(createFloatingText(x, y, `+${points}`, '#fbbf24', 14));
      if (blocksDestroyed > 1) {
        this.api.sounds.clearMulti(blocksDestroyed);
      } else {
        this.api.sounds.clearSingle();
      }
    }

    this.api.haptics.tap();
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

    // Update physics and check for ground impacts
    this.updatePhysicsWithGroundDestruction(dt);

    // Update explosions
    let explosionsActive = false;
    for (const explosion of this.explosions) {
      if (!explosion.active) continue;
      explosionsActive = true;
      const elapsed = time - explosion.startTime;
      explosion.radius = (elapsed / EXPLOSION_DURATION) * explosion.maxRadius;
      if (elapsed >= EXPLOSION_DURATION) {
        explosion.active = false;
      }
    }

    // Transition from Exploding to Settling
    if (this.gameState === GameState.Exploding && !explosionsActive) {
      this.gameState = GameState.Settling;
      this.settleStartTime = time;
    }

    // Check settling completion
    if (this.gameState === GameState.Settling) {
      const settled = this.checkSettled();
      const settleTimeout = (time - this.settleStartTime) > this.MAX_SETTLE_TIME;

      if (settled || settleTimeout) {
        this.onSettleComplete();
      }
    }

    // Filter effects
    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);

    this.render();

    // Continue loop if needed
    const needsLoop =
      this.gameState === GameState.Exploding ||
      this.gameState === GameState.Settling ||
      this.gameState === GameState.Aiming ||
      hasActiveEffects(this.particles, this.floatingTexts);

    if (needsLoop) {
      this.animationFrameId = requestAnimationFrame(this.gameLoop);
    } else {
      this.animationFrameId = 0;
    }
  };

  private updatePhysicsWithGroundDestruction(dt: number) {
    // Track blocks about to hit ground
    const activeBlocks = this.blocks.filter(b => !b.destroyed);

    for (const block of activeBlocks) {
      const wasAboveGround = block.y + block.height < this.world.groundY - 5;
      const hadHighVelocity = Math.abs(block.vy) > GROUND_IMPACT_VELOCITY;

      // Update physics
      updatePhysics([block], dt, this.world);

      // Check if block just hit ground with enough force
      const nowAtGround = block.y + block.height >= this.world.groundY - 5;

      if (wasAboveGround && nowAtGround && hadHighVelocity && !block.destroyed) {
        // Destroy block on impact!
        block.destroyed = true;

        const cx = block.x + block.width / 2;
        const cy = block.y + block.height / 2;
        const color = BLOCK_PROPERTIES[block.type].color;

        // Impact particles
        this.particles.push(...generateParticlesAt(cx, cy, color, 8));
        this.particles.push(...generateParticlesAt(cx, this.world.groundY, '#6b7280', 5));

        // Award points with real-time combo
        this.awardPoints(1, cx, cy, false);
      }
    }

    // Also update any remaining blocks (for collision resolution)
    updatePhysics(this.blocks, dt, this.world);
  }

  private checkSettled(): boolean {
    const activeBlocks = this.blocks.filter(b => !b.destroyed);
    if (activeBlocks.length === 0) return true;

    return activeBlocks.every(b => Math.abs(b.vx) < 10 && Math.abs(b.vy) < 10);
  }

  private onSettleComplete() {
    // Final combo summary
    if (this.blocksDestroyedThisTurn >= 8) {
      const rect = this.container.getBoundingClientRect();
      this.floatingTexts.push(
        createFloatingText(rect.width / 2, rect.height / 2,
          `DEMOLITION! ${this.blocksDestroyedThisTurn} blocks!`, '#f97316', 26)
      );
      this.api.sounds.newHighScore();
    } else if (this.blocksDestroyedThisTurn >= 5) {
      const rect = this.container.getBoundingClientRect();
      this.floatingTexts.push(
        createFloatingText(rect.width / 2, rect.height / 2,
          `${this.blocksDestroyedThisTurn} BLOCKS!`, '#eab308', 22)
      );
    }

    // Check win/lose conditions
    if (isTowerCleared(this.blocks, this.initialBlockCount)) {
      this.nextLevel();
    } else if (this.dynamiteRemaining <= 0) {
      this.triggerGameOver();
    } else {
      this.gameState = GameState.Ready;
    }
  }

  private nextLevel() {
    this.gameState = GameState.LevelComplete;
    this.level++;

    const dynamiteBonus = this.dynamiteRemaining * 100 * this.level;
    const rect = this.container.getBoundingClientRect();

    this.floatingTexts.push(
      createFloatingText(rect.width / 2, rect.height / 2 - 20, `Level ${this.level}!`, '#22c55e', 32)
    );

    if (dynamiteBonus > 0) {
      this.score += dynamiteBonus;
      this.api.setScore(this.score);
      this.floatingTexts.push(
        createFloatingText(rect.width / 2, rect.height / 2 + 20, `+${dynamiteBonus} bonus!`, '#fbbf24', 18)
      );
    }

    this.api.haptics.success();
    this.api.sounds.roundComplete();

    setTimeout(() => {
      if (this.isDestroyed) return;

      this.dynamiteRemaining = DYNAMITE_COUNT;
      this.explosions = [];

      const tower = generateTower(this.level, this.world.groundY, this.centerX);
      this.blocks = tower.blocks;
      this.initialBlockCount = this.blocks.length;
      this.gameState = GameState.Ready;

      this.render();
    }, 1500);
  }

  private triggerGameOver() {
    this.gameState = GameState.GameOver;

    const rect = this.container.getBoundingClientRect();
    const remaining = getActiveBlockCount(this.blocks);

    this.floatingTexts.push(
      createFloatingText(rect.width / 2, rect.height / 2, 'Out of Dynamite!', '#f87171', 24)
    );
    this.floatingTexts.push(
      createFloatingText(rect.width / 2, rect.height / 2 + 30, `${remaining} blocks remaining`, '#94a3b8', 16)
    );

    this.api.haptics.tap();
    this.api.sounds.gameOver();

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.api.gameOver(this.score);
      }
    }, 1500);
  }

  private render() {
    const rect = this.container.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    this.drawBackground();
    this.drawGround();
    this.drawBlocks();
    this.drawExplosions();
    this.drawAimPreview();
    this.drawHUD();

    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(this.ctx, this.particles, reduceMotion);
    drawFloatingTexts(this.ctx, this.floatingTexts, reduceMotion);
  }

  private drawBackground() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, '#1e3a5f');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  private drawGround() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    ctx.fillStyle = '#374151';
    ctx.fillRect(0, this.world.groundY, rect.width, rect.height - this.world.groundY);

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

      const cx = block.x + block.width / 2;
      const cy = block.y + block.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(block.rotation);
      ctx.translate(-block.width / 2, -block.height / 2);

      ctx.fillStyle = props.color;
      ctx.fillRect(0, 0, block.width, block.height);

      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, block.width, block.height);

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

      ctx.fillStyle = `rgba(249, 115, 22, ${alpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.radius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(251, 191, 36, ${alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawAimPreview() {
    if (this.gameState !== GameState.Aiming) return;

    const { ctx } = this;

    // Draw explosion radius preview
    if (this.isValidAim) {
      // Valid - show green/yellow
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
    } else {
      // Invalid - show red
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
    }

    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(this.aimX, this.aimY, EXPLOSION_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw dynamite icon at center
    if (this.isValidAim) {
      // Red stick
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(this.aimX - 5, this.aimY - 15, 10, 25);

      // Fuse
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.aimX, this.aimY - 15);
      ctx.quadraticCurveTo(this.aimX + 8, this.aimY - 22, this.aimX + 5, this.aimY - 28);
      ctx.stroke();

      // Spark
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(this.aimX + 5, this.aimY - 30, 4, 0, Math.PI * 2);
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

      if (available) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x - 4, dynamiteY - 12, 8, 20);

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, dynamiteY - 12);
        ctx.lineTo(x + 3, dynamiteY - 18);
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(x + 3, dynamiteY - 19, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(x - 4, dynamiteY - 12, 8, 20);
      }
    }

    // Blocks remaining with progress
    const remaining = getActiveBlockCount(this.blocks);
    const destroyed = this.initialBlockCount - remaining;
    const progress = this.initialBlockCount > 0 ? destroyed / this.initialBlockCount : 0;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Blocks: ${remaining}/${this.initialBlockCount}`, 20, 30);

    // Progress bar
    const barWidth = 80;
    const barHeight = 6;
    const barX = 20;
    const barY = 38;

    ctx.fillStyle = '#374151';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const progressColor = progress >= 0.7 ? '#22c55e' : progress >= 0.5 ? '#eab308' : '#94a3b8';
    ctx.fillStyle = progressColor;
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX + barWidth * 0.7, barY - 2);
    ctx.lineTo(barX + barWidth * 0.7, barY + barHeight + 2);
    ctx.stroke();

    // Instructions
    if (this.gameState === GameState.Ready && this.dynamiteRemaining > 0) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Hold & drag to aim, release to detonate', rect.width / 2, 50);
    } else if (this.gameState === GameState.Aiming) {
      ctx.fillStyle = this.isValidAim ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.isValidAim ? 'Release to detonate!' : 'Move closer to tower', rect.width / 2, 50);
    } else if (this.gameState === GameState.Settling) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Settling...', rect.width / 2, 50);
    }
  }

  start() {
    this.level = 1;
    this.score = 0;
    this.dynamiteRemaining = DYNAMITE_COUNT;
    this.gameState = GameState.Ready;
    this.explosions = [];
    this.particles = [];
    this.floatingTexts = [];
    this.currentCombo = 0;
    this.blocksDestroyedThisTurn = 0;

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
    if (this.gameState === GameState.Exploding || this.gameState === GameState.Settling) {
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
