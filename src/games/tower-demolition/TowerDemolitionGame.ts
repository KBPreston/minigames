import type { GameAPI, GameInstance } from '../../core/types';
import {
  Block,
  Explosion,
  BombType,
  BLOCK_PROPERTIES,
  BOMB_PROPERTIES,
  BOMBS_PER_LEVEL,
  EXPLOSION_DURATION,
} from './types';
import { updatePhysics, applyExplosion, PhysicsWorld, getCrushedBlocks } from './physics';
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
  Aiming,
  Exploding,
  Settling,
  LevelComplete,
  GameOver,
}

interface BombSlot {
  type: BombType;
  used: boolean;
}

const GROUND_IMPACT_VELOCITY = 70;

// Local dust particle type for smoke/dust effects
interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  size: number;
}

export class TowerDemolitionGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private blocks: Block[] = [];
  private explosions: Explosion[] = [];
  private bombs: BombSlot[] = [];
  private currentBombIndex: number = 0;
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

  // Screen shake
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.9;

  // Dust particles (separate from main particles for layering)
  private dustParticles: DustParticle[] = [];

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

  private generateBombs(): void {
    this.bombs = [];
    const bombTypes = Object.values(BombType);

    for (let i = 0; i < BOMBS_PER_LEVEL; i++) {
      let bombType: BombType;

      if (this.level === 1) {
        // Level 1: guaranteed one of each type for intro
        if (i === 0) bombType = BombType.Dynamite;
        else if (i === 1) bombType = BombType.CartoonBomb;
        else bombType = bombTypes[Math.floor(Math.random() * bombTypes.length)];
      } else {
        // Higher levels: random mix with slight preference for variety
        const weights = [0.3, 0.3, 0.2, 0.2]; // Dynamite, Cartoon, Cluster, Shockwave
        const rand = Math.random();
        let cumulative = 0;
        let typeIndex = 0;
        for (let j = 0; j < weights.length; j++) {
          cumulative += weights[j];
          if (rand < cumulative) {
            typeIndex = j;
            break;
          }
        }
        bombType = bombTypes[typeIndex];
      }

      this.bombs.push({ type: bombType, used: false });
    }
    this.currentBombIndex = 0;
  }

  private getCurrentBomb(): BombSlot | null {
    for (let i = this.currentBombIndex; i < this.bombs.length; i++) {
      if (!this.bombs[i].used) {
        this.currentBombIndex = i;
        return this.bombs[i];
      }
    }
    return null;
  }

  private getBombsRemaining(): number {
    return this.bombs.filter(b => !b.used).length;
  }

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
    if (this.getBombsRemaining() <= 0) return;
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
    if (this.getBombsRemaining() <= 0) return;

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

    const currentBomb = this.getCurrentBomb();
    const radius = currentBomb ? BOMB_PROPERTIES[currentBomb.type].radius : 55;

    const nearBlock = this.blocks.some(block => {
      if (block.destroyed) return false;
      const dx = x - (block.x + block.width / 2);
      const dy = y - (block.y + block.height / 2);
      return Math.sqrt(dx * dx + dy * dy) < radius * 2.5;
    });

    const nearGround = y > this.world.groundY - 60;
    const nearTowerX = Math.abs(x - this.centerX) < 180;

    this.isValidAim = nearBlock || (nearGround && nearTowerX);
    this.render();
  }

  private finishAiming() {
    if (!this.isValidAim) {
      this.floatingTexts.push(createFloatingText(this.aimX, this.aimY, 'Place near tower!', '#f87171', 14));
      this.api.sounds.invalid();
      this.gameState = GameState.Ready;
      this.startGameLoop();
      return;
    }

    this.placeBomb(this.aimX, this.aimY);
  }

  private placeBomb(x: number, y: number) {
    const bomb = this.getCurrentBomb();
    if (!bomb) return;

    bomb.used = true;
    this.gameState = GameState.Exploding;
    this.blocksDestroyedThisTurn = 0;
    this.currentCombo = 0;

    const props = BOMB_PROPERTIES[bomb.type];

    // Handle different bomb types
    if (bomb.type === BombType.Cluster) {
      // Cluster: 3 smaller explosions in a spread pattern
      const offsets = [
        { x: 0, y: 0 },
        { x: -35, y: -20 },
        { x: 35, y: -20 },
      ];

      for (let i = 0; i < offsets.length; i++) {
        const ox = x + offsets[i].x;
        const oy = y + offsets[i].y;

        setTimeout(() => {
          if (this.isDestroyed) return;

          const explosion: Explosion = {
            x: ox,
            y: oy,
            radius: 0,
            maxRadius: props.radius,
            active: true,
            startTime: performance.now(),
            bombType: bomb.type,
          };
          this.explosions.push(explosion);

          const destroyed = applyExplosion(
            this.blocks, ox, oy, props.radius, props.force, props.destroyRadius
          );

          if (destroyed.length > 0) {
            this.awardPoints(destroyed.length, ox, oy, true);
            this.createBlockDestroyParticles(destroyed, ox, oy);
          }

          this.createExplosionParticles(ox, oy, bomb.type);
          this.shakeIntensity = Math.max(this.shakeIntensity, 6);
          this.api.sounds.burst();
        }, i * 100);
      }
    } else {
      // Standard explosion
      const explosion: Explosion = {
        x,
        y,
        radius: 0,
        maxRadius: props.radius,
        active: true,
        startTime: performance.now(),
        bombType: bomb.type,
      };
      this.explosions.push(explosion);

      const destroyed = applyExplosion(
        this.blocks, x, y, props.radius, props.force, props.destroyRadius
      );

      if (destroyed.length > 0) {
        this.awardPoints(destroyed.length, x, y, true);
        this.createBlockDestroyParticles(destroyed, x, y);
      }

      this.createExplosionParticles(x, y, bomb.type);

      // Screen shake based on bomb type
      const shakeAmount = bomb.type === BombType.CartoonBomb ? 15 :
                         bomb.type === BombType.Shockwave ? 12 : 8;
      this.shakeIntensity = shakeAmount;

      this.api.sounds.burst();
    }

    this.api.haptics.success();
    this.startGameLoop();
  }

  private createExplosionParticles(x: number, y: number, bombType: BombType) {
    const props = BOMB_PROPERTIES[bombType];
    const particleCount = bombType === BombType.CartoonBomb ? 40 :
                         bombType === BombType.Cluster ? 15 : 25;

    // Main explosion particles
    this.particles.push(...generateParticlesAt(x, y, props.secondaryColor, particleCount));
    this.particles.push(...generateParticlesAt(x, y, '#ffffff', Math.floor(particleCount / 3)));

    // Smoke particles (darker, slower)
    for (let i = 0; i < particleCount / 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 100;
      this.dustParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 1,
        decay: 0.015 + Math.random() * 0.01,
        color: '#4b5563',
        size: 6 + Math.random() * 8,
      });
    }

    // Sparks for shockwave
    if (bombType === BombType.Shockwave) {
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 200 + Math.random() * 300;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: '#c4b5fd',
          size: 2 + Math.random() * 3,
          startTime: performance.now(),
          duration: 400 + Math.random() * 200,
        });
      }
    }
  }

  private createBlockDestroyParticles(blocks: Block[], explosionX: number, explosionY: number) {
    for (const block of blocks) {
      const cx = block.x + block.width / 2;
      const cy = block.y + block.height / 2;
      const color = BLOCK_PROPERTIES[block.type].color;

      // Direction away from explosion
      const dx = cx - explosionX;
      const dy = cy - explosionY;

      // Debris particles
      for (let i = 0; i < 6; i++) {
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.5;
        const speed = 150 + Math.random() * 200;
        this.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          size: 4 + Math.random() * 6,
          startTime: performance.now(),
          duration: 600 + Math.random() * 300,
        });
      }
    }
  }

  private awardPoints(blocksDestroyed: number, x: number, y: number, isExplosion: boolean) {
    this.blocksDestroyedThisTurn += blocksDestroyed;
    this.currentCombo += blocksDestroyed;

    // Reduced multiplier: 1 + (combo - 1) * 0.1 instead of 0.25
    const multiplier = 1 + (this.currentCombo - 1) * 0.1;
    // Reduced base points: 10/5 instead of 50/25
    const basePoints = isExplosion ? 10 : 5;
    // Reduced level multiplier effect
    const levelMult = 1 + (this.level - 1) * 0.1;
    const points = Math.floor(blocksDestroyed * basePoints * multiplier * levelMult);

    this.score += points;
    this.api.setScore(this.score);

    const color = this.currentCombo >= 12 ? '#f97316' :
                  this.currentCombo >= 6 ? '#eab308' : '#fbbf24';
    const size = Math.min(12 + Math.floor(this.currentCombo / 2), 24);

    if (this.currentCombo >= 8) {
      this.floatingTexts.push(createFloatingText(x, y - 20, `${this.currentCombo}x COMBO!`, color, size));
      this.floatingTexts.push(createFloatingText(x, y + 5, `+${points}`, '#fbbf24', 14));
      this.api.sounds.combo(this.currentCombo);
    } else if (this.currentCombo >= 4) {
      this.floatingTexts.push(createFloatingText(x, y - 10, `${this.currentCombo}x`, color, size));
      this.floatingTexts.push(createFloatingText(x, y + 10, `+${points}`, '#fbbf24', 12));
      this.api.sounds.clearMulti(blocksDestroyed);
    } else {
      this.floatingTexts.push(createFloatingText(x, y, `+${points}`, '#fbbf24', 12));
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

    // Update screen shake
    this.shakeIntensity *= this.shakeDecay;
    if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;

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

    // Update dust particles (slower physics)
    for (const p of this.dustParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 50 * dt; // Slower gravity for smoke
      p.vx *= 0.98;
      p.life -= p.decay;
    }
    this.dustParticles = this.dustParticles.filter(p => p.life > 0);

    // Filter effects
    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);

    this.render();

    const needsLoop =
      this.gameState === GameState.Exploding ||
      this.gameState === GameState.Settling ||
      this.gameState === GameState.Aiming ||
      this.shakeIntensity > 0 ||
      this.dustParticles.length > 0 ||
      hasActiveEffects(this.particles, this.floatingTexts);

    if (needsLoop) {
      this.animationFrameId = requestAnimationFrame(this.gameLoop);
    } else {
      this.animationFrameId = 0;
    }
  };

  private updatePhysicsWithGroundDestruction(dt: number) {
    // Track blocks that were above ground before physics update
    const blockStates = new Map<number, { wasAboveGround: boolean; previousVy: number }>();
    for (const block of this.blocks) {
      if (!block.destroyed) {
        blockStates.set(block.id, {
          wasAboveGround: block.y + block.height < this.world.groundY - 5,
          previousVy: block.vy,
        });
      }
    }

    // Run physics (handles collisions and crushing)
    updatePhysics(this.blocks, dt, this.world);

    // Handle crushed blocks (heavy blocks landing on light blocks)
    const crushed = getCrushedBlocks();
    for (const block of crushed) {
      const cx = block.x + block.width / 2;
      const cy = block.y + block.height / 2;
      const color = BLOCK_PROPERTIES[block.type].color;

      // Crushing particles - splat effect
      this.particles.push(...generateParticlesAt(cx, cy, color, 10));
      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 80;
        this.dustParticles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.025,
          color,
          size: 4 + Math.random() * 4,
        });
      }

      this.awardPoints(1, cx, cy, false);
      this.shakeIntensity = Math.max(this.shakeIntensity, 2);
    }

    // Check for ground impacts and off-screen blocks
    for (const block of this.blocks) {
      if (block.destroyed) continue;

      const state = blockStates.get(block.id);
      if (!state) continue;

      const nowAtGround = block.y + block.height >= this.world.groundY - 5;
      const hitGroundHard = state.wasAboveGround && nowAtGround && Math.abs(state.previousVy) > GROUND_IMPACT_VELOCITY;

      const fellOffSide = block.x + block.width < this.world.leftWall - 50 ||
                          block.x > this.world.rightWall + 50;
      const fellBelow = block.y > this.world.groundY + 100;

      if (hitGroundHard || fellOffSide || fellBelow) {
        block.destroyed = true;

        const cx = block.x + block.width / 2;
        const cy = Math.min(block.y + block.height / 2, this.world.groundY - 10);
        const color = BLOCK_PROPERTIES[block.type].color;

        this.particles.push(...generateParticlesAt(cx, cy, color, 8));

        if (hitGroundHard) {
          // Ground dust cloud
          for (let i = 0; i < 6; i++) {
            const angle = Math.PI + (Math.random() - 0.5) * Math.PI;
            const speed = 30 + Math.random() * 50;
            this.dustParticles.push({
              x: cx + (Math.random() - 0.5) * block.width,
              y: this.world.groundY - 5,
              vx: Math.cos(angle) * speed,
              vy: -Math.abs(Math.sin(angle) * speed) - 20,
              life: 1,
              decay: 0.025,
              color: '#6b7280',
              size: 4 + Math.random() * 4,
            });
          }
          this.shakeIntensity = Math.max(this.shakeIntensity, 2);
        }

        this.awardPoints(1, cx, cy, false);
      }
    }
  }

  private checkSettled(): boolean {
    const activeBlocks = this.blocks.filter(b => !b.destroyed);
    if (activeBlocks.length === 0) return true;

    return activeBlocks.every(b => Math.abs(b.vx) < 8 && Math.abs(b.vy) < 8);
  }

  private onSettleComplete() {
    if (this.blocksDestroyedThisTurn >= 10) {
      const rect = this.container.getBoundingClientRect();
      this.floatingTexts.push(
        createFloatingText(rect.width / 2, rect.height / 2,
          `DEMOLITION! ${this.blocksDestroyedThisTurn} blocks!`, '#f97316', 24)
      );
      this.api.sounds.newHighScore();
    } else if (this.blocksDestroyedThisTurn >= 6) {
      const rect = this.container.getBoundingClientRect();
      this.floatingTexts.push(
        createFloatingText(rect.width / 2, rect.height / 2,
          `${this.blocksDestroyedThisTurn} BLOCKS!`, '#eab308', 20)
      );
    }

    if (isTowerCleared(this.blocks, this.initialBlockCount)) {
      this.nextLevel();
    } else if (this.getBombsRemaining() <= 0) {
      this.triggerGameOver();
    } else {
      this.gameState = GameState.Ready;
    }
  }

  private nextLevel() {
    this.gameState = GameState.LevelComplete;
    this.level++;

    // Reduced bonus: 20 per bomb instead of 100
    const bombBonus = this.getBombsRemaining() * 20 * this.level;
    const rect = this.container.getBoundingClientRect();

    this.floatingTexts.push(
      createFloatingText(rect.width / 2, rect.height / 2 - 20, `Level ${this.level}!`, '#22c55e', 28)
    );

    if (bombBonus > 0) {
      this.score += bombBonus;
      this.api.setScore(this.score);
      this.floatingTexts.push(
        createFloatingText(rect.width / 2, rect.height / 2 + 20, `+${bombBonus} bonus!`, '#fbbf24', 16)
      );
    }

    this.api.haptics.success();
    this.api.sounds.roundComplete();

    setTimeout(() => {
      if (this.isDestroyed) return;

      this.generateBombs();
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
      createFloatingText(rect.width / 2, rect.height / 2, 'Out of Bombs!', '#f87171', 22)
    );
    this.floatingTexts.push(
      createFloatingText(rect.width / 2, rect.height / 2 + 30, `${remaining} blocks remaining`, '#94a3b8', 14)
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

    // Apply screen shake
    this.ctx.save();
    if (this.shakeIntensity > 0) {
      const shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.ctx.translate(shakeX, shakeY);
    }

    this.ctx.clearRect(-10, -10, rect.width + 20, rect.height + 20);

    this.drawBackground();
    this.drawGround();

    // Draw dust behind blocks
    this.drawDustParticles();

    this.drawBlocks();
    this.drawExplosions();
    this.drawAimPreview();
    this.drawHUD();

    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(this.ctx, this.particles, reduceMotion);
    drawFloatingTexts(this.ctx, this.floatingTexts, reduceMotion);

    this.ctx.restore();
  }

  private drawDustParticles() {
    const { ctx } = this;

    for (const p of this.dustParticles) {
      ctx.globalAlpha = p.life * 0.5;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawBackground() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, '#1e3a5f');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(-10, -10, rect.width + 20, rect.height + 20);
  }

  private drawGround() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    ctx.fillStyle = '#374151';
    ctx.fillRect(-10, this.world.groundY, rect.width + 20, rect.height - this.world.groundY + 10);

    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, this.world.groundY);
    ctx.lineTo(rect.width + 10, this.world.groundY);
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

      const radius = Math.max(0, explosion.radius);
      if (radius <= 0) continue;

      const progress = radius / explosion.maxRadius;
      const alpha = Math.max(0, 1 - progress);
      const props = BOMB_PROPERTIES[explosion.bombType];

      // Outer glow
      ctx.fillStyle = `rgba(${this.hexToRgb(props.secondaryColor)}, ${alpha * 0.2})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Main explosion
      ctx.fillStyle = `rgba(${this.hexToRgb(props.secondaryColor)}, ${alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Shockwave ring effect for shockwave bomb
      if (explosion.bombType === BombType.Shockwave) {
        ctx.strokeStyle = `rgba(196, 181, 253, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, radius * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '255, 255, 255';
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }

  private drawAimPreview() {
    if (this.gameState !== GameState.Aiming) return;

    const { ctx } = this;
    const currentBomb = this.getCurrentBomb();
    if (!currentBomb) return;

    const props = BOMB_PROPERTIES[currentBomb.type];

    // Draw explosion radius preview
    if (this.isValidAim) {
      ctx.strokeStyle = `rgba(34, 197, 94, 0.6)`;
      ctx.fillStyle = `rgba(34, 197, 94, 0.1)`;
    } else {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
    }

    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(this.aimX, this.aimY, props.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw bomb icon based on type
    if (this.isValidAim) {
      this.drawBombIcon(this.aimX, this.aimY, currentBomb.type, true);
    }
  }

  private drawBombIcon(x: number, y: number, bombType: BombType, large: boolean = false) {
    const { ctx } = this;
    const props = BOMB_PROPERTIES[bombType];
    const scale = large ? 1.2 : 1;

    ctx.save();

    switch (props.icon) {
      case 'stick': // Dynamite
        ctx.fillStyle = props.color;
        ctx.fillRect(x - 5 * scale, y - 15 * scale, 10 * scale, 25 * scale);

        ctx.strokeStyle = props.secondaryColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 15 * scale);
        ctx.quadraticCurveTo(x + 8 * scale, y - 22 * scale, x + 5 * scale, y - 28 * scale);
        ctx.stroke();

        ctx.fillStyle = props.secondaryColor;
        ctx.beginPath();
        ctx.arc(x + 5 * scale, y - 30 * scale, 4 * scale, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'bomb': // Cartoon bomb
        // Bomb body
        ctx.fillStyle = props.color;
        ctx.beginPath();
        ctx.arc(x, y, 14 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(x - 4 * scale, y - 4 * scale, 5 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Fuse
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 3 * scale;
        ctx.beginPath();
        ctx.moveTo(x + 8 * scale, y - 10 * scale);
        ctx.quadraticCurveTo(x + 15 * scale, y - 18 * scale, x + 10 * scale, y - 25 * scale);
        ctx.stroke();

        // Spark
        ctx.fillStyle = props.secondaryColor;
        ctx.beginPath();
        ctx.arc(x + 10 * scale, y - 27 * scale, 5 * scale, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'cluster': // Cluster bomb
        // Three small bombs
        const offsets = [[-6, 4], [6, 4], [0, -6]];
        for (const [ox, oy] of offsets) {
          ctx.fillStyle = props.color;
          ctx.beginPath();
          ctx.arc(x + ox * scale, y + oy * scale, 6 * scale, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.arc(x + ox * scale - 2 * scale, y + oy * scale - 2 * scale, 2 * scale, 0, Math.PI * 2);
          ctx.fill();
        }

        // Central spark
        ctx.fillStyle = props.secondaryColor;
        ctx.beginPath();
        ctx.arc(x, y - 15 * scale, 4 * scale, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'wave': // Shockwave
        // Purple orb
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 12 * scale);
        gradient.addColorStop(0, '#c4b5fd');
        gradient.addColorStop(1, props.color);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, 12 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Ring indicators
        ctx.strokeStyle = 'rgba(196, 181, 253, 0.5)';
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.arc(x, y, 18 * scale, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }

    ctx.restore();
  }

  private drawHUD() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    // Level indicator
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${this.level}`, rect.width / 2, 30);

    // Bombs remaining with type icons
    const bombY = rect.height - 35;
    const bombSpacing = 40;
    const startX = rect.width / 2 - (this.bombs.length - 1) * bombSpacing / 2;

    for (let i = 0; i < this.bombs.length; i++) {
      const bomb = this.bombs[i];
      const x = startX + i * bombSpacing;

      if (!bomb.used) {
        this.drawBombIcon(x, bombY, bomb.type, false);

        // Current bomb indicator
        if (i === this.currentBombIndex && this.gameState === GameState.Ready) {
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, bombY, 20, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Used bomb placeholder
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.arc(x, bombY, 10, 0, Math.PI * 2);
        ctx.fill();
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

    // Current bomb name
    const currentBomb = this.getCurrentBomb();
    if (currentBomb && this.gameState === GameState.Ready) {
      const props = BOMB_PROPERTIES[currentBomb.type];
      ctx.fillStyle = props.secondaryColor;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(props.name, rect.width / 2, rect.height - 60);
    }

    // Instructions
    if (this.gameState === GameState.Ready && this.getBombsRemaining() > 0) {
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
    this.gameState = GameState.Ready;
    this.explosions = [];
    this.particles = [];
    this.dustParticles = [];
    this.floatingTexts = [];
    this.currentCombo = 0;
    this.blocksDestroyedThisTurn = 0;
    this.shakeIntensity = 0;

    this.generateBombs();

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
