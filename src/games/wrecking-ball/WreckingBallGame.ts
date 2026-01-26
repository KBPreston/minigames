import type { GameAPI, GameInstance } from '../../core/types';
import { Ball, Brick, BrickType, BALL_COLOR, BALL_SPEED, BALL_RADIUS } from './types';
import { createBall, updateBall, calculateLaunchAngle, Bounds } from './physics';
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
  private ballsRemaining: number = 0;
  private level: number = 1;
  private score: number = 0;

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

    const padding = 16;
    this.bounds = {
      left: padding,
      right: rect.width - padding,
      top: padding,
      bottom: rect.height - 80,
    };

    // Calculate brick sizes
    const gridWidth = this.bounds.right - this.bounds.left;
    const cols = 8;
    const gap = 4;
    const brickWidth = (gridWidth - gap * (cols - 1)) / cols;
    const brickHeight = brickWidth * 0.5;

    this.levelConfig = {
      gridOffsetX: this.bounds.left,
      gridOffsetY: this.bounds.top + 60,
      brickWidth,
      brickHeight,
      brickGap: gap,
    };

    // Launch position at bottom center
    this.launchX = rect.width / 2;
    this.launchY = this.bounds.bottom - 20;

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
    if (this.ballsRemaining <= 0) return;

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
    if (this.ballsRemaining <= 0) return;

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
    this.isAiming = false;

    // Calculate launch angle
    const angle = calculateLaunchAngle(this.aimStartX, this.aimStartY, this.aimEndX, this.aimEndY);

    // Create and launch ball
    const ball = createBall(this.launchX, this.launchY, angle, BALL_SPEED, BALL_RADIUS);
    this.balls.push(ball);
    this.ballsRemaining--;

    this.api.haptics.tap();
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

    for (const ball of this.balls) {
      if (!ball.active) continue;
      anyActive = true;

      const result = updateBall(ball, dt, this.bounds, activeBricks);

      if (result.destroyed) {
        // Remove destroyed brick
        const idx = this.bricks.indexOf(result.destroyed);
        if (idx >= 0) {
          const brick = this.bricks[idx];
          // Add score
          const points = 10 * this.level;
          this.score += points;
          this.api.setScore(this.score);

          // Particles
          const cx = brick.x + brick.width / 2;
          const cy = brick.y + brick.height / 2;
          this.particles.push(...generateParticlesAt(cx, cy, brick.color, 8));
          this.floatingTexts.push(createFloatingText(cx, cy, `+${points}`, '#fbbf24', 16));

          this.api.haptics.tap();
        }
      } else if (result.exited) {
        // Ball exited bottom
      }
    }

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
    if (!anyActive && this.ballsRemaining <= 0 && !this.isGameOver) {
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
    this.ballsRemaining = levelData.ballCount;
    this.balls = [];
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

  private render() {
    const rect = this.container.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    this.drawHUD();
    this.drawBricks();
    this.drawBalls();
    this.drawAimLine();
    this.drawLauncher();

    // Effects
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(this.ctx, this.particles, reduceMotion);
    drawFloatingTexts(this.ctx, this.floatingTexts, reduceMotion);
  }

  private drawHUD() {
    const { ctx } = this;

    // Level indicator
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${this.level}`, this.bounds.left, 30);

    // Balls remaining
    ctx.textAlign = 'right';
    ctx.fillText(`Balls: ${this.ballsRemaining}`, this.bounds.right, 30);

    // Ball indicators
    const ballIndicatorY = 45;
    const ballIndicatorSpacing = 20;
    const startX = this.bounds.right - (this.ballsRemaining - 1) * ballIndicatorSpacing;

    ctx.fillStyle = BALL_COLOR;
    for (let i = 0; i < this.ballsRemaining; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * ballIndicatorSpacing - 10, ballIndicatorY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBricks() {
    const { ctx } = this;

    for (const brick of this.bricks) {
      if (brick.hp <= 0) continue;

      ctx.fillStyle = brick.color;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
      ctx.fill();

      // Draw HP indicator for strong bricks
      if (brick.type === BrickType.Strong && brick.hp > 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.font = 'bold 12px system-ui, sans-serif';
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
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        const pad = 6;
        ctx.beginPath();
        ctx.moveTo(brick.x + pad, brick.y + pad);
        ctx.lineTo(brick.x + brick.width - pad, brick.y + brick.height - pad);
        ctx.moveTo(brick.x + brick.width - pad, brick.y + pad);
        ctx.lineTo(brick.x + pad, brick.y + brick.height - pad);
        ctx.stroke();
      }
    }
  }

  private drawBalls() {
    const { ctx } = this;

    ctx.fillStyle = BALL_COLOR;
    ctx.shadowColor = BALL_COLOR;
    ctx.shadowBlur = 10;

    for (const ball of this.balls) {
      if (!ball.active) continue;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  private drawAimLine() {
    if (!this.isAiming) return;

    const { ctx } = this;
    const angle = calculateLaunchAngle(this.aimStartX, this.aimStartY, this.aimEndX, this.aimEndY);

    // Draw dotted line in launch direction
    const lineLength = 150;
    const endX = this.launchX + Math.cos(angle) * lineLength;
    const endY = this.launchY + Math.sin(angle) * lineLength;

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(this.launchX, this.launchY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw arrow head
    const arrowSize = 10;
    const arrowAngle = Math.PI / 6;
    ctx.fillStyle = 'rgba(248, 250, 252, 0.6)';
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

  private drawLauncher() {
    const { ctx } = this;

    // Draw launch position indicator
    ctx.fillStyle = 'rgba(248, 250, 252, 0.3)';
    ctx.beginPath();
    ctx.arc(this.launchX, this.launchY, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.launchX, this.launchY, 15, 0, Math.PI * 2);
    ctx.stroke();

    // Inner dot
    ctx.fillStyle = BALL_COLOR;
    ctx.beginPath();
    ctx.arc(this.launchX, this.launchY, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  start() {
    this.level = 1;
    this.score = 0;
    this.isGameOver = false;
    this.balls = [];
    this.particles = [];
    this.floatingTexts = [];

    const levelData = generateLevel(this.level, this.levelConfig);
    this.bricks = levelData.bricks;
    this.ballsRemaining = levelData.ballCount;

    this.api.setScore(0);
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
