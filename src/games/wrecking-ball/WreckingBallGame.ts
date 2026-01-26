import type { GameAPI, GameInstance } from '../../core/types';
import {
  Ball,
  Brick,
  BrickType,
  BallType,
  QueuedBall,
  BALL_COLOR,
  BALL_SPEED,
  BALL_RADIUS,
  MINI_BALL_RADIUS,
  SHIELD_COLOR,
  BOMB_COLOR,
  TRIPLE_SHOT_COLOR,
} from './types';
import {
  createBall,
  createTripleShotBalls,
  updateBall,
  calculateLaunchAngle,
  calculateTrajectory,
  Bounds,
} from './physics';
import { generateLevel, updateBrickColor, isLevelCleared, LevelConfig } from './levels';
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

export class WreckingBallGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private balls: Ball[] = [];
  private bricks: Brick[] = [];
  private shields: Brick[] = [];
  private ballQueue: QueuedBall[] = [];
  private level: number = 1;
  private score: number = 0;
  private pendingExplosions: { x: number; y: number; radius: number; combo: number }[] = [];

  private launchX: number = 0;
  private launchY: number = 0;
  private isAiming: boolean = false;
  private aimStartX: number = 0;
  private aimStartY: number = 0;
  private aimEndX: number = 0;
  private aimEndY: number = 0;

  private bounds: Bounds = { left: 0, right: 0, top: 0, bottom: 0 };
  private levelConfig: LevelConfig = {
    gridOffsetX: 0,
    gridOffsetY: 0,
    brickWidth: 0,
    brickHeight: 0,
    brickGap: 4,
  };

  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private isGameOver: boolean = false;
  private lastTime: number = 0;
  private animationFrameId: number = 0;

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

    // Optimized for vertical phone layout
    const sidePadding = 12;
    const topPadding = 50; // Space for level indicator

    // Launch position at bottom center
    this.launchX = rect.width / 2;
    this.launchY = rect.height - 60;

    // Bottom boundary below the shields (shields are at launchY + 25)
    const bottomBoundary = this.launchY + 50;

    this.bounds = {
      left: sidePadding,
      right: rect.width - sidePadding,
      top: topPadding,
      bottom: bottomBoundary,
    };

    // Calculate brick sizes - smaller bricks for more play area
    const gridWidth = this.bounds.right - this.bounds.left;
    const cols = 8;
    const gap = 3;
    // Smaller bricks: use 0.4 ratio instead of full width division
    const brickWidth = Math.floor((gridWidth - gap * (cols - 1)) / cols * 0.85);
    const brickHeight = Math.floor(brickWidth * 0.45);

    // Center the grid horizontally
    const totalGridWidth = brickWidth * cols + gap * (cols - 1);
    const gridOffsetX = (rect.width - totalGridWidth) / 2;

    this.levelConfig = {
      gridOffsetX,
      gridOffsetY: this.bounds.top,
      brickWidth,
      brickHeight,
      brickGap: gap,
    };

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

  private getEventPosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private handleTouchStart = (e: TouchEvent) => {
    if (this.isPaused || this.isGameOver) return;
    if (this.balls.some(b => b.active)) return; // Can't aim while balls are moving
    if (this.ballQueue.length <= 0) return;

    e.preventDefault();
    const touch = e.touches[0];
    const pos = this.getEventPosition(touch.clientX, touch.clientY);
    this.startAiming(pos.x, pos.y);
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (!this.isAiming) return;
    e.preventDefault();
    const touch = e.touches[0];
    const pos = this.getEventPosition(touch.clientX, touch.clientY);
    this.updateAiming(pos.x, pos.y);
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (!this.isAiming) return;
    e.preventDefault();
    this.finishAiming();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isPaused || this.isGameOver) return;
    if (this.balls.some(b => b.active)) return;
    if (this.ballQueue.length <= 0) return;

    const pos = this.getEventPosition(e.clientX, e.clientY);
    this.startAiming(pos.x, pos.y);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isAiming) return;
    const pos = this.getEventPosition(e.clientX, e.clientY);
    this.updateAiming(pos.x, pos.y);
  };

  private handleMouseUp = () => {
    if (!this.isAiming) return;
    this.finishAiming();
  };

  private startAiming(x: number, y: number) {
    this.isAiming = true;
    this.aimStartX = this.launchX;
    this.aimStartY = this.launchY;
    this.aimEndX = x;
    this.aimEndY = y;
    this.render();
  }

  private updateAiming(x: number, y: number) {
    this.aimEndX = x;
    this.aimEndY = y;
    this.render();
  }

  private finishAiming() {
    if (!this.isAiming) return;
    if (this.ballQueue.length <= 0) return;
    this.isAiming = false;

    // Calculate launch angle
    const angle = calculateLaunchAngle(this.aimStartX, this.aimStartY, this.aimEndX, this.aimEndY);

    // Get the next ball from queue
    const queuedBall = this.ballQueue.shift()!;

    // Create and launch ball(s) based on type
    if (queuedBall.type === BallType.TripleShot) {
      const tripleBalls = createTripleShotBalls(this.launchX, this.launchY, angle, BALL_SPEED);
      // Initialize combo counter for each ball
      for (const b of tripleBalls) {
        b.combo = 0;
      }
      this.balls.push(...tripleBalls);
      this.api.sounds.burst();
    } else {
      const ball = createBall(this.launchX, this.launchY, angle, BALL_SPEED, BALL_RADIUS, BallType.Normal);
      ball.combo = 0;
      this.balls.push(ball);
    }

    this.api.haptics.tap();
    this.api.sounds.place();
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

    const dt = Math.min((time - this.lastTime) / 1000, 0.05); // Cap at 50ms
    this.lastTime = time;

    // Update balls
    let anyActive = false;
    const activeBricks = this.bricks.filter(b => b.hp > 0);
    const activeShields = this.shields.filter(s => s.hp > 0);
    const allCollidables = [...activeBricks, ...activeShields];

    for (const ball of this.balls) {
      if (!ball.active) continue;
      anyActive = true;

      const result = updateBall(ball, dt, this.bounds, allCollidables);

      if (result.destroyed) {
        const isShield = this.shields.includes(result.destroyed);

        if (isShield) {
          // Shield destroyed - no score, just visual feedback
          const shield = result.destroyed;
          const cx = shield.x + shield.width / 2;
          const cy = shield.y + shield.height / 2;
          this.particles.push(...generateParticlesAt(cx, cy, SHIELD_COLOR, 6));
          this.floatingTexts.push(createFloatingText(cx, cy, 'SAVED!', SHIELD_COLOR, 14));
          this.api.haptics.tap();
        } else {
          // Regular brick destroyed
          const brick = result.destroyed;

          // Check if it's a bomb - trigger explosion
          if (brick.type === BrickType.Bomb) {
            // Bomb counts toward combo
            ball.combo = (ball.combo || 0) + 1;
            this.triggerBombExplosion(brick, ball.combo);
          } else {
            // Increment combo for this ball
            ball.combo = (ball.combo || 0) + 1;
            const combo = ball.combo;

            // Calculate multiplier: 1x for first brick, 1.5x for 2nd, 2x for 3rd, etc.
            const multiplier = 1 + (combo - 1) * 0.5;
            const basePoints = 10 * this.level;
            const points = Math.floor(basePoints * multiplier);
            this.score += points;
            this.api.setScore(this.score);

            const cx = brick.x + brick.width / 2;
            const cy = brick.y + brick.height / 2;

            // Escalating feedback based on combo
            if (combo >= 5) {
              // MEGA combo (5+) - huge feedback
              this.particles.push(...generateParticlesAt(cx, cy, brick.color, 25));
              this.particles.push(...generateParticlesAt(cx, cy, '#fbbf24', 15)); // Gold particles
              this.floatingTexts.push(createFloatingText(cx, cy - 20, `${combo}x MEGA!`, '#f97316', 28));
              this.floatingTexts.push(createFloatingText(cx, cy + 10, `+${points}`, '#fbbf24', 20));
              this.api.haptics.success();
              this.api.sounds.combo(combo);
            } else if (combo >= 3) {
              // Great combo (3-4) - big feedback
              this.particles.push(...generateParticlesAt(cx, cy, brick.color, 16));
              this.particles.push(...generateParticlesAt(cx, cy, '#fbbf24', 8));
              this.floatingTexts.push(createFloatingText(cx, cy - 15, `${combo}x COMBO!`, '#eab308', 22));
              this.floatingTexts.push(createFloatingText(cx, cy + 10, `+${points}`, '#fbbf24', 18));
              this.api.haptics.success();
              this.api.sounds.combo(combo);
            } else if (combo >= 2) {
              // Good combo (2) - medium feedback
              this.particles.push(...generateParticlesAt(cx, cy, brick.color, 12));
              this.floatingTexts.push(createFloatingText(cx, cy - 10, `${combo}x`, '#84cc16', 18));
              this.floatingTexts.push(createFloatingText(cx, cy + 8, `+${points}`, '#fbbf24', 16));
              this.api.haptics.tap();
              this.api.sounds.clearMulti(combo);
            } else {
              // First brick - normal feedback
              this.particles.push(...generateParticlesAt(cx, cy, brick.color, 8));
              this.floatingTexts.push(createFloatingText(cx, cy, `+${points}`, '#fbbf24', 16));
              this.api.haptics.tap();
              this.api.sounds.clearSingle();
            }
          }
        }
      }

      // Ball exited the play area - show combo summary if it was good
      if (result.exited && ball.combo && ball.combo >= 3) {
        const rect = this.container.getBoundingClientRect();
        const summaryY = rect.height - 120;
        const combo = ball.combo;

        if (combo >= 7) {
          this.floatingTexts.push(createFloatingText(rect.width / 2, summaryY, `LEGENDARY ${combo} HIT STREAK!`, '#f97316', 26));
          this.api.sounds.newHighScore();
        } else if (combo >= 5) {
          this.floatingTexts.push(createFloatingText(rect.width / 2, summaryY, `AMAZING ${combo} HIT STREAK!`, '#eab308', 22));
        } else {
          this.floatingTexts.push(createFloatingText(rect.width / 2, summaryY, `${combo} HIT STREAK!`, '#84cc16', 20));
        }
      }
    }

    // Process pending bomb explosions
    this.processBombExplosions();

    // Update brick colors for damaged bricks
    for (const brick of this.bricks) {
      if (brick.hp > 0 && brick.hp < brick.maxHp) {
        updateBrickColor(brick);
      }
    }

    // Filter effects
    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);

    // Check level cleared
    if (isLevelCleared(this.bricks)) {
      this.nextLevel();
      anyActive = false;
    }

    // Check game over (no balls remaining and none active)
    if (!anyActive && this.ballQueue.length <= 0 && !this.isGameOver) {
      if (!isLevelCleared(this.bricks)) {
        this.triggerGameOver();
        return;
      }
    }

    this.render();

    // Continue loop if balls active or effects playing
    if (anyActive || hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animationFrameId = requestAnimationFrame(this.gameLoop);
    } else {
      this.animationFrameId = 0;
    }
  };

  private nextLevel() {
    this.level++;

    // Bonus points for clearing level
    const bonus = 100 * this.level;
    this.score += bonus;
    this.api.setScore(this.score);

    // Show level clear message
    const rect = this.container.getBoundingClientRect();
    this.floatingTexts.push(
      createFloatingText(rect.width / 2, rect.height / 2, `Level ${this.level}!`, '#22c55e', 32)
    );
    this.floatingTexts.push(
      createFloatingText(rect.width / 2, rect.height / 2 + 40, `+${bonus} bonus`, '#fbbf24', 20)
    );

    this.api.haptics.success();

    // Generate new level
    const levelData = generateLevel(this.level, this.levelConfig);
    this.bricks = levelData.bricks;
    this.ballQueue = levelData.ballQueue;
    this.balls = [];
    this.pendingExplosions = [];
    this.createShields();

    this.api.sounds.roundComplete();
  }

  private triggerGameOver() {
    this.isGameOver = true;
    this.api.haptics.tap();

    // Delay game over to show final state
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.api.gameOver(this.score);
      }
    }, 500);
  }

  private triggerBombExplosion(bomb: Brick, combo: number) {
    const cx = bomb.x + bomb.width / 2;
    const cy = bomb.y + bomb.height / 2;
    const explosionRadius = bomb.width * 2.5; // Explosion affects nearby area

    // Visual explosion effect
    this.particles.push(...generateParticlesAt(cx, cy, BOMB_COLOR, 20));
    this.particles.push(...generateParticlesAt(cx, cy, '#fbbf24', 15)); // Orange particles

    // Points for bomb with multiplier
    const multiplier = 1 + (combo - 1) * 0.5;
    const bombPoints = Math.floor(25 * this.level * multiplier);
    this.score += bombPoints;
    this.api.setScore(this.score);
    this.floatingTexts.push(createFloatingText(cx, cy, `BOOM! +${bombPoints}`, BOMB_COLOR, 20));

    this.api.haptics.success();
    this.api.sounds.burst();

    // Queue the explosion to destroy nearby bricks, passing current combo
    this.pendingExplosions.push({ x: cx, y: cy, radius: explosionRadius, combo });
  }

  private processBombExplosions() {
    if (this.pendingExplosions.length === 0) return;

    const explosions = [...this.pendingExplosions];
    this.pendingExplosions = [];

    for (const explosion of explosions) {
      const { x: ex, y: ey, radius } = explosion;
      let { combo } = explosion;

      // Find bricks in explosion radius
      for (const brick of this.bricks) {
        if (brick.hp <= 0) continue;
        if (brick.type === BrickType.Indestructible) continue;

        const brickCx = brick.x + brick.width / 2;
        const brickCy = brick.y + brick.height / 2;
        const dx = brickCx - ex;
        const dy = brickCy - ey;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < radius) {
          // Destroy the brick
          brick.hp = 0;

          // Increment combo and calculate multiplier
          combo++;
          const multiplier = 1 + (combo - 1) * 0.5;
          const points = Math.floor(10 * this.level * multiplier);
          this.score += points;
          this.api.setScore(this.score);

          // Visual effect with combo feedback
          if (combo >= 5) {
            this.particles.push(...generateParticlesAt(brickCx, brickCy, brick.color, 16));
            this.particles.push(...generateParticlesAt(brickCx, brickCy, '#fbbf24', 8));
            this.floatingTexts.push(createFloatingText(brickCx, brickCy, `${combo}x +${points}`, '#f97316', 18));
          } else if (combo >= 3) {
            this.particles.push(...generateParticlesAt(brickCx, brickCy, brick.color, 10));
            this.floatingTexts.push(createFloatingText(brickCx, brickCy, `${combo}x +${points}`, '#eab308', 16));
          } else {
            this.particles.push(...generateParticlesAt(brickCx, brickCy, brick.color, 6));
            this.floatingTexts.push(createFloatingText(brickCx, brickCy, `+${points}`, '#fbbf24', 14));
          }

          // Chain reaction for bombs - pass along the combo
          if (brick.type === BrickType.Bomb) {
            this.pendingExplosions.push({
              x: brickCx,
              y: brickCy,
              radius: brick.width * 2.5,
              combo,
            });
          }
        }
      }
    }

    // Show chain bonus if multiple explosions
    if (this.pendingExplosions.length > 0) {
      const rect = this.container.getBoundingClientRect();
      this.floatingTexts.push(
        createFloatingText(rect.width / 2, rect.height / 2, 'CHAIN!', '#f97316', 24)
      );
      this.api.sounds.combo(2);
    }
  }

  private render() {
    const rect = this.container.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    this.drawBoundaries();
    this.drawHUD();
    this.drawBricks();
    this.drawShields();
    this.drawBalls();
    this.drawAimLine();
    this.drawLauncher();
    this.drawBallIndicators();

    // Effects
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(this.ctx, this.particles, reduceMotion);
    drawFloatingTexts(this.ctx, this.floatingTexts, reduceMotion);
  }

  private drawBoundaries() {
    const { ctx } = this;
    const { left, right, top } = this.bounds;

    // Draw play area boundary walls
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)'; // slate-500 with transparency
    ctx.lineWidth = 2;

    // Left wall
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, this.launchY + 20);
    ctx.stroke();

    // Right wall
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right, this.launchY + 20);
    ctx.stroke();

    // Top wall
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.stroke();

    // Corner accents for visibility
    const cornerSize = 8;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)'; // slate-400, brighter
    ctx.lineWidth = 3;

    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(left, top + cornerSize);
    ctx.lineTo(left, top);
    ctx.lineTo(left + cornerSize, top);
    ctx.stroke();

    // Top-right corner
    ctx.beginPath();
    ctx.moveTo(right - cornerSize, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + cornerSize);
    ctx.stroke();
  }

  private drawHUD() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    // Level indicator at top
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${this.level}`, rect.width / 2, 30);
  }

  private drawBallIndicators() {
    const { ctx } = this;
    const rect = this.container.getBoundingClientRect();

    // Ball indicators near the launcher
    const ballIndicatorY = rect.height - 25;
    const ballIndicatorSpacing = 18;
    const displayCount = Math.min(this.ballQueue.length, 10);
    const totalWidth = (displayCount - 1) * ballIndicatorSpacing;
    const startX = rect.width / 2 - totalWidth / 2;

    for (let i = 0; i < displayCount; i++) {
      const queuedBall = this.ballQueue[i];
      const isTripleShot = queuedBall.type === BallType.TripleShot;

      ctx.fillStyle = isTripleShot ? TRIPLE_SHOT_COLOR : BALL_COLOR;

      if (isTripleShot) {
        // Draw three small dots for triple shot
        const cx = startX + i * ballIndicatorSpacing;
        ctx.beginPath();
        ctx.arc(cx - 3, ballIndicatorY - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 3, ballIndicatorY - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, ballIndicatorY + 2, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(startX + i * ballIndicatorSpacing, ballIndicatorY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // "x N" label
    if (this.ballQueue.length > 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`x${this.ballQueue.length}`, rect.width / 2, rect.height - 8);
    }
  }

  private drawBricks() {
    const { ctx } = this;

    for (const brick of this.bricks) {
      if (brick.hp <= 0) continue;

      // Special glow for bomb blocks
      if (brick.type === BrickType.Bomb) {
        ctx.shadowColor = BOMB_COLOR;
        ctx.shadowBlur = 8;
      }

      ctx.fillStyle = brick.color;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 3);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw HP number for any brick with more than 1 HP
      if (brick.type !== BrickType.Indestructible && brick.type !== BrickType.Bomb && brick.hp > 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.font = `bold ${Math.min(brick.height * 0.6, 14)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          String(brick.hp),
          brick.x + brick.width / 2,
          brick.y + brick.height / 2
        );
      }

      // Draw X for indestructible
      if (brick.type === BrickType.Indestructible) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        const pad = Math.min(brick.width, brick.height) * 0.2;
        ctx.beginPath();
        ctx.moveTo(brick.x + pad, brick.y + pad);
        ctx.lineTo(brick.x + brick.width - pad, brick.y + brick.height - pad);
        ctx.moveTo(brick.x + brick.width - pad, brick.y + pad);
        ctx.lineTo(brick.x + pad, brick.y + brick.height - pad);
        ctx.stroke();
      }

      // Draw bomb icon
      if (brick.type === BrickType.Bomb) {
        const cx = brick.x + brick.width / 2;
        const cy = brick.y + brick.height / 2;
        const size = Math.min(brick.width, brick.height) * 0.35;

        // Bomb body (circle)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(cx, cy + 1, size, 0, Math.PI * 2);
        ctx.fill();

        // Fuse
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size + 1);
        ctx.lineTo(cx + 3, cy - size - 3);
        ctx.stroke();

        // Spark
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(cx + 3, cy - size - 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawShields() {
    const { ctx } = this;

    for (const shield of this.shields) {
      if (shield.hp <= 0) continue;

      // Draw shield with glow effect
      ctx.shadowColor = SHIELD_COLOR;
      ctx.shadowBlur = 8;
      ctx.fillStyle = SHIELD_COLOR;
      ctx.beginPath();
      ctx.roundRect(shield.x, shield.y, shield.width, shield.height, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw shield icon/pattern
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      const cx = shield.x + shield.width / 2;
      const cy = shield.y + shield.height / 2;
      // Small shield icon
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 3);
      ctx.lineTo(cx, cy - 5);
      ctx.lineTo(cx + 6, cy - 3);
      ctx.lineTo(cx + 6, cy + 2);
      ctx.lineTo(cx, cy + 5);
      ctx.lineTo(cx - 6, cy + 2);
      ctx.closePath();
      ctx.stroke();
    }
  }

  private drawBalls() {
    const { ctx } = this;

    for (const ball of this.balls) {
      if (!ball.active) continue;

      const color = ball.type === BallType.TripleShot ? TRIPLE_SHOT_COLOR : BALL_COLOR;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  private drawAimLine() {
    if (!this.isAiming) return;
    if (this.ballQueue.length === 0) return;

    const { ctx } = this;
    const angle = calculateLaunchAngle(this.aimStartX, this.aimStartY, this.aimEndX, this.aimEndY);
    const nextBall = this.ballQueue[0];
    const isTripleShot = nextBall.type === BallType.TripleShot;

    // Calculate trajectory with bounces
    const activeBricks = [...this.bricks.filter(b => b.hp > 0), ...this.shields.filter(s => s.hp > 0)];
    const radius = isTripleShot ? MINI_BALL_RADIUS : BALL_RADIUS;

    if (isTripleShot) {
      // Draw three trajectory lines for triple shot
      const spreadAngle = Math.PI / 12;
      const angles = [angle - spreadAngle, angle, angle + spreadAngle];

      for (const a of angles) {
        const trajectory = calculateTrajectory(
          this.launchX, this.launchY, a, BALL_SPEED, radius,
          this.bounds, activeBricks, 2, 400
        );
        this.drawTrajectoryPath(trajectory, TRIPLE_SHOT_COLOR, 0.4);
      }
    } else {
      // Draw single trajectory
      const trajectory = calculateTrajectory(
        this.launchX, this.launchY, angle, BALL_SPEED, radius,
        this.bounds, activeBricks, 3, 600
      );
      this.drawTrajectoryPath(trajectory, BALL_COLOR, 0.6);
    }

    // Draw arrow head at initial direction
    const arrowLength = 30;
    const endX = this.launchX + Math.cos(angle) * arrowLength;
    const endY = this.launchY + Math.sin(angle) * arrowLength;
    const arrowSize = 10;
    const arrowAngle = Math.PI / 6;

    ctx.fillStyle = isTripleShot ? `${TRIPLE_SHOT_COLOR}99` : 'rgba(248, 250, 252, 0.6)';
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle - arrowAngle),
      endY - arrowSize * Math.sin(angle - arrowAngle)
    );
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle + arrowAngle),
      endY - arrowSize * Math.sin(angle + arrowAngle)
    );
    ctx.closePath();
    ctx.fill();
  }

  private drawTrajectoryPath(trajectory: { x: number; y: number; bounce: boolean }[], color: string, alpha: number) {
    const { ctx } = this;

    if (trajectory.length < 2) return;

    // Draw the path as dotted line
    ctx.strokeStyle = color.startsWith('#')
      ? `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
      : `rgba(248, 250, 252, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);

    ctx.beginPath();
    ctx.moveTo(trajectory[0].x, trajectory[0].y);

    for (let i = 1; i < trajectory.length; i++) {
      ctx.lineTo(trajectory[i].x, trajectory[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw bounce indicators
    ctx.fillStyle = color;
    for (const point of trajectory) {
      if (point.bounce) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawLauncher() {
    const { ctx } = this;
    const nextBall = this.ballQueue[0];
    const isTripleShot = nextBall?.type === BallType.TripleShot;
    const ballColor = isTripleShot ? TRIPLE_SHOT_COLOR : BALL_COLOR;

    // Draw launch position indicator
    ctx.fillStyle = 'rgba(248, 250, 252, 0.3)';
    ctx.beginPath();
    ctx.arc(this.launchX, this.launchY, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isTripleShot ? `${TRIPLE_SHOT_COLOR}88` : 'rgba(248, 250, 252, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.launchX, this.launchY, 15, 0, Math.PI * 2);
    ctx.stroke();

    // Inner indicator showing ball type
    if (isTripleShot && nextBall) {
      // Draw three small dots for triple shot
      ctx.fillStyle = TRIPLE_SHOT_COLOR;
      ctx.beginPath();
      ctx.arc(this.launchX - 4, this.launchY - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.launchX + 4, this.launchY - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.launchX, this.launchY + 3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Normal ball dot
      ctx.fillStyle = ballColor;
      ctx.beginPath();
      ctx.arc(this.launchX, this.launchY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private createShields() {
    const rect = this.container.getBoundingClientRect();
    const shieldWidth = 68; // 50% wider for better coverage
    const shieldHeight = 10;
    const shieldY = this.launchY + 30; // Below the launcher
    const centerX = rect.width / 2;
    const centerGap = 100; // Wide gap around launcher to avoid visual confusion

    // 4 shields spread across the bottom, away from launcher
    // Two on far left, two on far right, leaving center clear
    const leftEdge = this.bounds.left;
    const rightEdge = this.bounds.right;
    const sideWidth = centerX - centerGap / 2 - leftEdge;

    this.shields = [
      // Far left shield
      {
        x: leftEdge + sideWidth * 0.1,
        y: shieldY,
        width: shieldWidth,
        height: shieldHeight,
        hp: 1,
        maxHp: 1,
        type: BrickType.Shield,
        color: SHIELD_COLOR,
      },
      // Inner left shield
      {
        x: leftEdge + sideWidth * 0.6,
        y: shieldY,
        width: shieldWidth,
        height: shieldHeight,
        hp: 1,
        maxHp: 1,
        type: BrickType.Shield,
        color: SHIELD_COLOR,
      },
      // Inner right shield
      {
        x: centerX + centerGap / 2 + sideWidth * 0.2,
        y: shieldY,
        width: shieldWidth,
        height: shieldHeight,
        hp: 1,
        maxHp: 1,
        type: BrickType.Shield,
        color: SHIELD_COLOR,
      },
      // Far right shield
      {
        x: rightEdge - shieldWidth - sideWidth * 0.1,
        y: shieldY,
        width: shieldWidth,
        height: shieldHeight,
        hp: 1,
        maxHp: 1,
        type: BrickType.Shield,
        color: SHIELD_COLOR,
      },
    ];
  }

  start() {
    this.level = 1;
    this.score = 0;
    this.isGameOver = false;
    this.balls = [];
    this.particles = [];
    this.floatingTexts = [];
    this.pendingExplosions = [];

    const levelData = generateLevel(this.level, this.levelConfig);
    this.bricks = levelData.bricks;
    this.ballQueue = levelData.ballQueue;
    this.createShields();

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
    if (this.balls.some(b => b.active)) {
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
