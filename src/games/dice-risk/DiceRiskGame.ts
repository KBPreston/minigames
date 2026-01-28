import type { GameAPI, GameInstance } from '../../core/types';
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
import {
  SpaceType,
  BoardSpace,
  GamePhase,
  DiceAnimation,
  MoveAnimation,
} from './types';
import {
  generateBoard,
  getSpaceColor,
  applySpaceEffect,
  indexToGridPosition,
  getSpacePosition,
} from './board';

const COLS = 7;
const BOARD_SIZE = 35;
const DICE_ROLL_DURATION = 1500;
const MOVE_HOP_DURATION = 200;

export class DiceRiskGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private board: BoardSpace[] = [];
  private position: number = 0;
  private score: number = 0;
  private phase: GamePhase = GamePhase.Idle;
  private lastRoll: number = 0;
  private selectedDice: number = 0;

  private diceAnimation: DiceAnimation | null = null;
  private moveAnimation: MoveAnimation | null = null;

  private cellWidth: number = 0;
  private cellHeight: number = 0;
  private boardOffsetX: number = 0;
  private boardOffsetY: number = 0;
  private buttonY: number = 0;
  private buttonHeight: number = 50;

  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private animationFrame: number = 0;
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
    this.canvas.addEventListener('click', this.handleClick);
  }

  private resize = () => {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    const padding = 16;
    const statusHeight = 50;
    const buttonAreaHeight = 80;
    const availWidth = rect.width - padding * 2;
    const availHeight = rect.height - padding * 2 - statusHeight - buttonAreaHeight;

    const rows = Math.ceil(BOARD_SIZE / COLS);
    this.cellWidth = Math.floor(availWidth / COLS);
    this.cellHeight = Math.floor(availHeight / rows);

    // Keep cells somewhat square
    const minDim = Math.min(this.cellWidth, this.cellHeight);
    this.cellWidth = minDim;
    this.cellHeight = minDim;

    const boardWidth = this.cellWidth * COLS;
    const boardHeight = this.cellHeight * rows;

    this.boardOffsetX = (rect.width - boardWidth) / 2;
    this.boardOffsetY = statusHeight + (availHeight - boardHeight) / 2;
    this.buttonY = rect.height - buttonAreaHeight;
    this.buttonHeight = 50;

    this.render();
  };

  private handleClick = (e: MouseEvent) => {
    if (this.isPaused || this.isDestroyed) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on dice buttons (only in Idle phase)
    if (this.phase === GamePhase.Idle && y >= this.buttonY) {
      const buttonWidth = rect.width / 3;
      const buttonIndex = Math.floor(x / buttonWidth);

      if (buttonIndex >= 0 && buttonIndex < 3) {
        this.selectDice(buttonIndex + 1);
      }
    }
  };

  private selectDice(count: number) {
    if (this.phase !== GamePhase.Idle) return;

    this.selectedDice = count;
    this.api.haptics.tap();
    this.api.sounds.select();

    // Start rolling
    this.startRoll();
  }

  private startRoll() {
    this.phase = GamePhase.Rolling;

    // Generate final roll values
    const finalFaces: number[] = [];
    for (let i = 0; i < this.selectedDice; i++) {
      finalFaces.push(Math.floor(Math.random() * 6) + 1);
    }

    this.diceAnimation = {
      startTime: performance.now(),
      duration: DICE_ROLL_DURATION,
      currentFaces: finalFaces.map(() => 1),
      finalFaces,
    };

    this.lastRoll = finalFaces.reduce((a, b) => a + b, 0);
    this.api.sounds.place();
    this.animateRoll();
  }

  private animateRoll = () => {
    if (!this.diceAnimation || this.isDestroyed || this.isPaused) return;

    const elapsed = performance.now() - this.diceAnimation.startTime;
    const progress = Math.min(elapsed / this.diceAnimation.duration, 1);

    // Update displayed faces with random values, settling toward final
    if (progress < 0.8) {
      this.diceAnimation.currentFaces = this.diceAnimation.currentFaces.map((_, i) => {
        // Chance to show final value increases over time
        if (Math.random() < progress) {
          return this.diceAnimation!.finalFaces[i];
        }
        return Math.floor(Math.random() * 6) + 1;
      });
    } else {
      // Final 20% - settle to final values
      this.diceAnimation.currentFaces = [...this.diceAnimation.finalFaces];
    }

    this.render();

    if (progress < 1) {
      this.animationFrame = requestAnimationFrame(this.animateRoll);
    } else {
      // Roll complete, start moving
      this.startMoving();
    }
  };

  private startMoving() {
    this.phase = GamePhase.Moving;
    const targetPosition = Math.min(this.position + this.lastRoll, BOARD_SIZE - 1);

    this.moveAnimation = {
      startTime: performance.now(),
      currentSpace: this.position,
      targetSpace: targetPosition,
      progress: 0,
    };

    this.animateMove();
  }

  private animateMove = () => {
    if (!this.moveAnimation || this.isDestroyed || this.isPaused) return;

    const elapsed = performance.now() - this.moveAnimation.startTime;
    const totalSpaces = this.moveAnimation.targetSpace - this.moveAnimation.currentSpace;
    const totalDuration = totalSpaces * MOVE_HOP_DURATION;
    const progress = Math.min(elapsed / totalDuration, 1);

    // Calculate which space we're currently on/animating to
    const spacesCompleted = Math.floor(progress * totalSpaces);
    const currentSpace = this.moveAnimation.currentSpace + spacesCompleted;

    // Play hop sound for each space
    const prevSpaces = Math.floor(this.moveAnimation.progress * totalSpaces);
    if (spacesCompleted > prevSpaces) {
      this.api.sounds.drop();
      this.api.haptics.tap();
    }

    this.moveAnimation.progress = progress;
    this.position = currentSpace;
    this.render();

    if (progress < 1) {
      this.animationFrame = requestAnimationFrame(this.animateMove);
    } else {
      // Movement complete
      this.position = this.moveAnimation.targetSpace;
      this.moveAnimation = null;
      this.applyLandingEffect();
    }
  };

  private applyLandingEffect() {
    this.phase = GamePhase.Effect;

    const space = this.board[this.position];
    const effect = applySpaceEffect(space, this.lastRoll, this.score);

    // Get position for effects
    const pos = getSpacePosition(
      this.position,
      this.cellWidth,
      this.cellHeight,
      this.boardOffsetX,
      this.boardOffsetY
    );

    // Apply score change
    this.score = Math.max(0, this.score + effect.points);
    this.api.setScore(this.score);

    // Create visual effects based on space type
    const color = getSpaceColor(space.type);

    switch (space.type) {
      case SpaceType.Bonus:
      case SpaceType.Star:
        this.particles.push(...generateParticlesAt(pos.x, pos.y, color, 12));
        this.floatingTexts.push(
          createFloatingText(pos.x, pos.y - 20, `+${effect.points}`, color, 24)
        );
        this.api.sounds.combo(space.type === SpaceType.Star ? 3 : 2);
        this.api.haptics.success();
        break;

      case SpaceType.Mult2x:
      case SpaceType.Mult3x:
        this.particles.push(...generateParticlesAt(pos.x, pos.y, color, 10));
        this.floatingTexts.push(
          createFloatingText(
            pos.x,
            pos.y - 20,
            `${effect.multiplier}x${effect.roll} = +${effect.points}`,
            color,
            20
          )
        );
        this.api.sounds.merge(effect.points);
        this.api.haptics.success();
        break;

      case SpaceType.Penalty:
        this.floatingTexts.push(
          createFloatingText(pos.x, pos.y - 20, `${effect.points}`, '#f97316', 24)
        );
        this.api.sounds.warning();
        break;

      case SpaceType.Danger:
        this.floatingTexts.push(
          createFloatingText(pos.x, pos.y - 20, `${effect.points}`, '#ef4444', 24)
        );
        this.api.sounds.warning();
        break;

      case SpaceType.Finish:
        this.particles.push(...generateParticlesAt(pos.x, pos.y, color, 20));
        this.floatingTexts.push(
          createFloatingText(pos.x, pos.y - 20, `+${effect.points} FINISH!`, color, 28)
        );
        this.api.sounds.newHighScore();
        this.api.haptics.success();
        break;

      case SpaceType.Normal:
        if (effect.points > 0) {
          this.floatingTexts.push(
            createFloatingText(pos.x, pos.y - 20, `+${effect.points}`, '#9ca3af', 18)
          );
        }
        break;
    }

    this.render();

    // Check if game is over
    if (this.position >= BOARD_SIZE - 1) {
      this.phase = GamePhase.Finished;
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.api.gameOver(this.score);
        }
      }, 1500);
    } else {
      // Return to idle after effect
      setTimeout(() => {
        if (!this.isDestroyed && !this.isPaused) {
          this.phase = GamePhase.Idle;
          this.diceAnimation = null;
          this.render();
        }
      }, 500);
    }

    // Animate effects
    if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animateEffects();
    }
  }

  private animateEffects = () => {
    if (this.isDestroyed || this.isPaused) return;

    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);
    this.render();

    if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animationFrame = requestAnimationFrame(this.animateEffects);
    }
  };

  private render() {
    if (this.isDestroyed) return;

    const rect = this.container.getBoundingClientRect();
    const { ctx } = this;

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw board
    this.drawBoard();

    // Draw player
    this.drawPlayer();

    // Draw dice/roll result
    this.drawDice();

    // Draw status
    this.drawStatus(rect.width);

    // Draw buttons
    this.drawButtons(rect.width, rect.height);

    // Draw effects
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(ctx, this.particles, reduceMotion);
    drawFloatingTexts(ctx, this.floatingTexts, reduceMotion);
  }

  private drawBoard() {
    const { ctx, cellWidth, cellHeight, boardOffsetX, boardOffsetY } = this;

    for (let i = 0; i < BOARD_SIZE; i++) {
      const space = this.board[i];
      const { row, col } = indexToGridPosition(i);

      const x = boardOffsetX + col * cellWidth;
      const y = boardOffsetY + row * cellHeight;
      const pad = 2;

      // Draw space background
      ctx.fillStyle = getSpaceColor(space.type);
      ctx.beginPath();
      ctx.roundRect(x + pad, y + pad, cellWidth - pad * 2, cellHeight - pad * 2, 6);
      ctx.fill();

      // Draw space label
      ctx.fillStyle = space.type === SpaceType.Normal ? '#1f2937' : '#fff';
      ctx.font = `bold ${Math.min(cellWidth, cellHeight) * 0.28}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const label = space.label || '';
      ctx.fillText(label, x + cellWidth / 2, y + cellHeight / 2);

      // Draw space number in corner
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.font = `${Math.min(cellWidth, cellHeight) * 0.18}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(i), x + pad + 4, y + pad + 2);
    }
  }

  private drawPlayer() {
    const { ctx, cellWidth, cellHeight, boardOffsetX, boardOffsetY, moveAnimation } = this;

    let pos: { x: number; y: number };

    if (moveAnimation) {
      // Interpolate position during movement
      const totalSpaces = moveAnimation.targetSpace - moveAnimation.currentSpace;
      const exactSpace = moveAnimation.currentSpace + moveAnimation.progress * totalSpaces;
      const currentSpace = Math.floor(exactSpace);
      const nextSpace = Math.min(currentSpace + 1, BOARD_SIZE - 1);
      const spaceFraction = exactSpace - currentSpace;

      const currentPos = getSpacePosition(
        currentSpace,
        cellWidth,
        cellHeight,
        boardOffsetX,
        boardOffsetY
      );
      const nextPos = getSpacePosition(
        nextSpace,
        cellWidth,
        cellHeight,
        boardOffsetX,
        boardOffsetY
      );

      // Hop animation (arc)
      const hopHeight = cellHeight * 0.5;
      const hopY = Math.sin(spaceFraction * Math.PI) * hopHeight;

      pos = {
        x: currentPos.x + (nextPos.x - currentPos.x) * spaceFraction,
        y: currentPos.y + (nextPos.y - currentPos.y) * spaceFraction - hopY,
      };
    } else {
      pos = getSpacePosition(
        this.position,
        cellWidth,
        cellHeight,
        boardOffsetX,
        boardOffsetY
      );
    }

    // Draw player piece
    const radius = Math.min(cellWidth, cellHeight) * 0.3;

    // Glow
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();

    // Main piece
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(
      pos.x - radius * 0.3,
      pos.y - radius * 0.3,
      0,
      pos.x,
      pos.y,
      radius
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#60a5fa');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Border
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawDice() {
    const { ctx, diceAnimation } = this;
    if (!diceAnimation && this.phase === GamePhase.Idle) return;

    const rect = this.container.getBoundingClientRect();
    const diceSize = 40;
    const diceY = this.buttonY - 60;
    const faces = diceAnimation?.currentFaces || [];
    const totalWidth = faces.length * (diceSize + 10) - 10;
    let startX = (rect.width - totalWidth) / 2;

    for (const face of faces) {
      // Draw die
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(startX, diceY - diceSize / 2, diceSize, diceSize, 6);
      ctx.fill();

      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw pips
      ctx.fillStyle = '#1f2937';
      this.drawDicePips(startX + diceSize / 2, diceY, diceSize * 0.7, face);

      startX += diceSize + 10;
    }

    // Show total
    if (faces.length > 0 && this.phase !== GamePhase.Rolling) {
      const total = faces.reduce((a, b) => a + b, 0);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Roll: ${total}`, rect.width / 2, diceY + 35);
    }
  }

  private drawDicePips(cx: number, cy: number, size: number, value: number) {
    const { ctx } = this;
    const pipRadius = size * 0.1;
    const offset = size * 0.25;

    const pipPositions: Record<number, [number, number][]> = {
      1: [[0, 0]],
      2: [
        [-offset, -offset],
        [offset, offset],
      ],
      3: [
        [-offset, -offset],
        [0, 0],
        [offset, offset],
      ],
      4: [
        [-offset, -offset],
        [offset, -offset],
        [-offset, offset],
        [offset, offset],
      ],
      5: [
        [-offset, -offset],
        [offset, -offset],
        [0, 0],
        [-offset, offset],
        [offset, offset],
      ],
      6: [
        [-offset, -offset],
        [offset, -offset],
        [-offset, 0],
        [offset, 0],
        [-offset, offset],
        [offset, offset],
      ],
    };

    const pips = pipPositions[value] || [];
    for (const [px, py] of pips) {
      ctx.beginPath();
      ctx.arc(cx + px, cy + py, pipRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStatus(width: number) {
    const { ctx } = this;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Position: ${this.position}/${BOARD_SIZE - 1}`, width / 2, 15);
  }

  private drawButtons(width: number, _height: number) {
    const { ctx, phase, buttonY, buttonHeight } = this;
    const buttonWidth = width / 3 - 16;
    const labels = ['1 DIE', '2 DICE', '3 DICE'];
    const sublabels = ['Safe', 'Balanced', 'Risky'];
    const isDisabled = phase !== GamePhase.Idle;

    for (let i = 0; i < 3; i++) {
      const x = 8 + i * (buttonWidth + 16);
      const y = buttonY + 10;

      // Button background
      ctx.fillStyle = isDisabled ? '#374151' : '#4f46e5';
      ctx.beginPath();
      ctx.roundRect(x, y, buttonWidth, buttonHeight, 10);
      ctx.fill();

      // Button text
      ctx.fillStyle = isDisabled ? '#6b7280' : '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], x + buttonWidth / 2, y + buttonHeight / 2 - 8);

      ctx.font = '11px sans-serif';
      ctx.fillStyle = isDisabled ? '#4b5563' : '#c7d2fe';
      ctx.fillText(sublabels[i], x + buttonWidth / 2, y + buttonHeight / 2 + 10);
    }
  }

  start() {
    this.board = generateBoard();
    this.position = 0;
    this.score = 0;
    this.phase = GamePhase.Idle;
    this.lastRoll = 0;
    this.selectedDice = 0;
    this.diceAnimation = null;
    this.moveAnimation = null;
    this.isPaused = false;
    this.particles = [];
    this.floatingTexts = [];

    this.api.setScore(0);
    this.api.sounds.gameStart();
    this.render();
  }

  pause() {
    this.isPaused = true;
    cancelAnimationFrame(this.animationFrame);
  }

  resume() {
    this.isPaused = false;
    this.render();

    // Resume appropriate animation
    if (this.phase === GamePhase.Rolling && this.diceAnimation) {
      this.animateRoll();
    } else if (this.phase === GamePhase.Moving && this.moveAnimation) {
      this.animateMove();
    } else if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animateEffects();
    }
  }

  reset() {
    this.start();
  }

  destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.remove();
  }
}
