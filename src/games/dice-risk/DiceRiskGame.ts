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
  getBoardSizeForLevel,
  getStartingDice,
} from './types';
import {
  generateRingBoard,
  getSpaceColor,
  applySpaceEffect,
  indexToRingPosition,
  getSpacePosition,
  getRingGridSize,
} from './board';

const DICE_ROLL_DURATION = 1500;
const MOVE_HOP_DURATION = 200;
const LEVEL_UP_DURATION = 2000;

export class DiceRiskGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private board: BoardSpace[] = [];
  private boardSize: number = 20;
  private position: number = 0;
  private score: number = 0;
  private dicePool: number = 10;
  private level: number = 1;
  private lapProgress: number = 0;
  private phase: GamePhase = GamePhase.Idle;
  private lastRoll: number = 0;
  private selectedDice: number = 0;

  private diceAnimation: DiceAnimation | null = null;
  private moveAnimation: MoveAnimation | null = null;
  private levelUpStartTime: number = 0;

  private cellSize: number = 0;
  private boardOffsetX: number = 0;
  private boardOffsetY: number = 0;
  private buttonY: number = 0;
  private buttonHeight: number = 50;
  private dicePoolY: number = 0;

  private isPaused: boolean = false;
  private isDestroyed: boolean = false;
  private animationFrame: number = 0;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private lowDiceWarningPulse: number = 0;

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
    const statusHeight = 60;
    const dicePoolHeight = 60;
    const buttonAreaHeight = 80;
    const availWidth = rect.width - padding * 2;
    const availHeight = rect.height - padding * 2 - statusHeight - dicePoolHeight - buttonAreaHeight;

    // Calculate cell size for ring board
    const gridSize = getRingGridSize(this.boardSize);
    const maxCellWidth = Math.floor(availWidth / gridSize);
    const maxCellHeight = Math.floor(availHeight / gridSize);
    this.cellSize = Math.min(maxCellWidth, maxCellHeight, 70);

    const boardWidth = this.cellSize * gridSize;
    const boardHeight = this.cellSize * gridSize;

    this.boardOffsetX = (rect.width - boardWidth) / 2;
    this.boardOffsetY = statusHeight + (availHeight - boardHeight) / 2;
    this.dicePoolY = this.boardOffsetY + boardHeight + 10;
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
    if (this.phase === GamePhase.Idle && y >= this.buttonY + 10 && y <= this.buttonY + 10 + this.buttonHeight) {
      const buttonWidth = rect.width / 3 - 16;
      for (let i = 0; i < 3; i++) {
        const buttonX = 8 + i * (buttonWidth + 16);
        if (x >= buttonX && x <= buttonX + buttonWidth) {
          const diceCount = i + 1;
          // Only allow if we have enough dice
          if (this.dicePool >= diceCount) {
            this.selectDice(diceCount);
          } else {
            // Not enough dice - play warning
            this.api.sounds.warning();
          }
          break;
        }
      }
    }
  };

  private selectDice(count: number) {
    if (this.phase !== GamePhase.Idle) return;

    this.selectedDice = count;
    this.dicePool -= count; // Spend dice
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

    // Calculate target position (wrap around the board)
    const targetPosition = (this.position + this.lastRoll) % this.boardSize;

    this.moveAnimation = {
      startTime: performance.now(),
      currentSpace: this.position,
      targetSpace: targetPosition,
      progress: 0,
    };

    // Track lap progress
    this.lapProgress += this.lastRoll;

    this.animateMove();
  }

  private animateMove = () => {
    if (!this.moveAnimation || this.isDestroyed || this.isPaused) return;

    const elapsed = performance.now() - this.moveAnimation.startTime;
    const totalSpaces = this.lastRoll;
    const totalDuration = totalSpaces * MOVE_HOP_DURATION;
    const progress = Math.min(elapsed / totalDuration, 1);

    // Calculate which space we're currently on/animating to
    const spacesCompleted = Math.floor(progress * totalSpaces);

    // Play hop sound for each space
    const prevSpaces = Math.floor(this.moveAnimation.progress * totalSpaces);
    if (spacesCompleted > prevSpaces) {
      this.api.sounds.drop();
      this.api.haptics.tap();
    }

    this.moveAnimation.progress = progress;
    this.position = (this.moveAnimation.currentSpace + spacesCompleted) % this.boardSize;
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
    const effect = applySpaceEffect(space, this.lastRoll, this.level);

    // Get position for effects
    const pos = getSpacePosition(
      this.position,
      this.boardSize,
      this.cellSize,
      this.boardOffsetX,
      this.boardOffsetY
    );

    // Apply score change
    this.score = Math.max(0, this.score + effect.points);
    this.api.setScore(this.score);

    // Apply dice change
    if (effect.diceChange) {
      this.dicePool = Math.max(0, this.dicePool + effect.diceChange);
    }

    // Create visual effects based on space type
    const color = getSpaceColor(space.type);

    switch (space.type) {
      case SpaceType.Bonus:
        this.particles.push(...generateParticlesAt(pos.x, pos.y, color, 12));
        this.floatingTexts.push(
          createFloatingText(pos.x, pos.y - 20, `+${effect.points}`, color, 24)
        );
        this.api.sounds.combo(2);
        this.api.haptics.success();
        break;

      case SpaceType.Jackpot:
        this.particles.push(...generateParticlesAt(pos.x, pos.y, color, 20));
        this.floatingTexts.push(
          createFloatingText(pos.x, pos.y - 20, `+${effect.points}`, color, 28)
        );
        this.floatingTexts.push(
          createFloatingText(pos.x, pos.y + 20, `+${effect.diceChange}D`, '#06b6d4', 24)
        );
        this.api.sounds.newHighScore();
        this.api.haptics.success();
        break;

      case SpaceType.Dice:
        this.particles.push(...generateParticlesAt(pos.x, pos.y, color, 10));
        this.floatingTexts.push(
          createFloatingText(pos.x, pos.y - 20, `+${effect.diceChange}D`, color, 24)
        );
        this.api.sounds.combo(1);
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
          createFloatingText(pos.x, pos.y - 20, `${effect.diceChange}D`, '#ef4444', 24)
        );
        this.api.sounds.warning();
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

    // Check for lap completion
    if (this.lapProgress >= this.boardSize) {
      this.lapProgress = this.lapProgress % this.boardSize;
      this.triggerLevelUp();
      return;
    }

    // Check for game over (out of dice)
    if (this.dicePool <= 0) {
      this.triggerGameOver();
      return;
    }

    // Return to idle after effect
    setTimeout(() => {
      if (!this.isDestroyed && !this.isPaused) {
        this.phase = GamePhase.Idle;
        this.diceAnimation = null;
        this.render();
      }
    }, 500);

    // Animate effects
    if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animateEffects();
    }
  }

  private triggerLevelUp() {
    this.phase = GamePhase.LevelUp;
    this.level++;
    this.levelUpStartTime = performance.now();

    // Check if board size should change
    const newBoardSize = getBoardSizeForLevel(this.level);
    const boardSizeChanged = newBoardSize !== this.boardSize;

    if (boardSizeChanged) {
      this.boardSize = newBoardSize;
      // Give bonus dice for board size increase
      const bonusDice = Math.floor((newBoardSize - this.boardSize) / 4);
      this.dicePool += bonusDice;
    }

    // Regenerate board for new level
    this.board = generateRingBoard(this.level);
    // Keep position but wrap if needed
    this.position = this.position % this.boardSize;

    // Level up celebration
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Burst of particles
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const dist = 50 + Math.random() * 100;
      const x = centerX + Math.cos(angle) * dist;
      const y = centerY + Math.sin(angle) * dist;
      this.particles.push(...generateParticlesAt(x, y, '#eab308', 3));
    }

    this.floatingTexts.push(
      createFloatingText(centerX, centerY, `LEVEL ${this.level}!`, '#eab308', 36)
    );

    this.api.sounds.roundComplete();
    this.api.haptics.success();

    this.resize(); // Update layout for new board size
    this.animateLevelUp();
  }

  private animateLevelUp = () => {
    if (this.isDestroyed || this.isPaused) return;

    const elapsed = performance.now() - this.levelUpStartTime;

    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);
    this.render();

    if (elapsed < LEVEL_UP_DURATION) {
      this.animationFrame = requestAnimationFrame(this.animateLevelUp);
    } else {
      // Check for game over (out of dice)
      if (this.dicePool <= 0) {
        this.triggerGameOver();
        return;
      }

      this.phase = GamePhase.Idle;
      this.diceAnimation = null;
      this.render();
    }
  };

  private triggerGameOver() {
    this.phase = GamePhase.GameOver;
    this.api.sounds.gameOver();

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.api.gameOver(this.score);
      }
    }, 1500);
  }

  private animateEffects = () => {
    if (this.isDestroyed || this.isPaused) return;

    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);

    // Update low dice warning pulse
    if (this.dicePool <= 3 && this.dicePool > 0) {
      this.lowDiceWarningPulse = (this.lowDiceWarningPulse + 0.1) % (Math.PI * 2);
    }

    this.render();

    if (hasActiveEffects(this.particles, this.floatingTexts)) {
      this.animationFrame = requestAnimationFrame(this.animateEffects);
    }
  };

  private render() {
    if (this.isDestroyed || this.board.length === 0) return;

    const rect = this.container.getBoundingClientRect();
    const { ctx } = this;

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw status
    this.drawStatus(rect.width);

    // Draw board
    this.drawBoard();

    // Draw player
    this.drawPlayer();

    // Draw dice pool
    this.drawDicePool(rect.width);

    // Draw rolling dice
    this.drawRollingDice(rect.width);

    // Draw buttons
    this.drawButtons(rect.width);

    // Draw level up overlay
    if (this.phase === GamePhase.LevelUp) {
      this.drawLevelUpOverlay(rect.width, rect.height);
    }

    // Draw effects
    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(ctx, this.particles, reduceMotion);
    drawFloatingTexts(ctx, this.floatingTexts, reduceMotion);
  }

  private drawBoard() {
    const { ctx, cellSize, boardOffsetX, boardOffsetY, boardSize } = this;

    for (let i = 0; i < boardSize; i++) {
      const space = this.board[i];
      const { x, y } = indexToRingPosition(i, boardSize);

      const px = boardOffsetX + x * cellSize;
      const py = boardOffsetY + y * cellSize;
      const pad = 2;

      // Draw space background
      ctx.fillStyle = getSpaceColor(space.type);
      ctx.beginPath();
      ctx.roundRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, 6);
      ctx.fill();

      // Draw space label
      ctx.fillStyle = space.type === SpaceType.Normal ? '#1f2937' : '#fff';
      ctx.font = `bold ${cellSize * 0.25}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const label = space.label || '';
      ctx.fillText(label, px + cellSize / 2, py + cellSize / 2);

      // Draw space number in corner
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.font = `${cellSize * 0.18}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(i), px + pad + 4, py + pad + 2);
    }
  }

  private drawPlayer() {
    const { ctx, cellSize, boardOffsetX, boardOffsetY, boardSize, moveAnimation } = this;

    let pos: { x: number; y: number };

    if (moveAnimation) {
      // Interpolate position during movement
      const totalSpaces = this.lastRoll;
      const exactSpace = moveAnimation.progress * totalSpaces;
      const currentSpaceOffset = Math.floor(exactSpace);
      const spaceFraction = exactSpace - currentSpaceOffset;

      const currentSpace = (moveAnimation.currentSpace + currentSpaceOffset) % boardSize;
      const nextSpace = (currentSpace + 1) % boardSize;

      const currentPos = getSpacePosition(
        currentSpace,
        boardSize,
        cellSize,
        boardOffsetX,
        boardOffsetY
      );
      const nextPos = getSpacePosition(
        nextSpace,
        boardSize,
        cellSize,
        boardOffsetX,
        boardOffsetY
      );

      // Hop animation (arc)
      const hopHeight = cellSize * 0.5;
      const hopY = Math.sin(spaceFraction * Math.PI) * hopHeight;

      pos = {
        x: currentPos.x + (nextPos.x - currentPos.x) * spaceFraction,
        y: currentPos.y + (nextPos.y - currentPos.y) * spaceFraction - hopY,
      };
    } else {
      pos = getSpacePosition(
        this.position,
        boardSize,
        cellSize,
        boardOffsetX,
        boardOffsetY
      );
    }

    // Draw player piece
    const radius = cellSize * 0.3;

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

  private drawDicePool(width: number) {
    const { ctx, dicePoolY, dicePool } = this;
    const diceSize = 28;
    const diceGap = 6;
    const maxVisibleDice = 15;
    const visibleDice = Math.min(dicePool, maxVisibleDice);

    // Calculate total width
    const totalWidth = visibleDice * (diceSize + diceGap) - diceGap;
    let startX = (width - totalWidth) / 2;

    // Low dice warning pulse
    let warningAlpha = 0;
    if (dicePool <= 3 && dicePool > 0) {
      warningAlpha = Math.abs(Math.sin(this.lowDiceWarningPulse)) * 0.5;
      ctx.fillStyle = `rgba(239, 68, 68, ${warningAlpha})`;
      ctx.fillRect(0, dicePoolY - 10, width, 55);
    }

    // Label
    ctx.fillStyle = dicePool <= 3 ? '#ef4444' : '#94a3b8';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Dice Pool: ${dicePool}`, width / 2, dicePoolY - 5);

    // Draw dice icons
    for (let i = 0; i < visibleDice; i++) {
      const x = startX + i * (diceSize + diceGap);
      const y = dicePoolY + 15;

      // Die background
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(x, y, diceSize, diceSize, 4);
      ctx.fill();

      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw a simple die face (showing 6)
      ctx.fillStyle = '#1f2937';
      const pipSize = diceSize * 0.12;
      const offset = diceSize * 0.25;
      const cx = x + diceSize / 2;
      const cy = y + diceSize / 2;

      // 6 pips
      const pips = [
        [-offset, -offset], [offset, -offset],
        [-offset, 0], [offset, 0],
        [-offset, offset], [offset, offset],
      ];
      for (const [px, py] of pips) {
        ctx.beginPath();
        ctx.arc(cx + px, cy + py, pipSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Show overflow indicator
    if (dicePool > maxVisibleDice) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${dicePool - maxVisibleDice}`, startX + totalWidth + 8, dicePoolY + 15 + diceSize / 2);
    }
  }

  private drawRollingDice(width: number) {
    const { ctx, diceAnimation, phase } = this;
    if (!diceAnimation && phase === GamePhase.Idle) return;

    const diceSize = 40;
    const diceY = this.buttonY - 60;
    const faces = diceAnimation?.currentFaces || [];
    const totalWidth = faces.length * (diceSize + 10) - 10;
    let startX = (width - totalWidth) / 2;

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
    if (faces.length > 0 && phase !== GamePhase.Rolling) {
      const total = faces.reduce((a, b) => a + b, 0);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Roll: ${total}`, width / 2, diceY + 35);
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

    // Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${this.score}`, 16, 15);

    // Level
    ctx.fillStyle = '#eab308';
    ctx.textAlign = 'right';
    ctx.fillText(`Level ${this.level}`, width - 16, 15);

    // Progress indicator
    const progressWidth = width - 32;
    const progressHeight = 6;
    const progressY = 42;
    const progress = (this.lapProgress % this.boardSize) / this.boardSize;

    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.roundRect(16, progressY, progressWidth, progressHeight, 3);
    ctx.fill();

    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.roundRect(16, progressY, progressWidth * progress, progressHeight, 3);
    ctx.fill();
  }

  private drawButtons(width: number) {
    const { ctx, phase, buttonY, buttonHeight, dicePool } = this;
    const buttonWidth = width / 3 - 16;
    const labels = ['1 DIE', '2 DICE', '3 DICE'];
    const sublabels = ['Safe', 'Balanced', 'Risky'];

    for (let i = 0; i < 3; i++) {
      const x = 8 + i * (buttonWidth + 16);
      const y = buttonY + 10;
      const diceRequired = i + 1;
      const isDisabled = phase !== GamePhase.Idle || dicePool < diceRequired;

      // Button background
      if (isDisabled) {
        ctx.fillStyle = '#374151';
      } else if (dicePool === diceRequired) {
        // Last chance - highlight
        ctx.fillStyle = '#dc2626';
      } else {
        ctx.fillStyle = '#4f46e5';
      }
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

      // Show dice cost
      if (!isDisabled && dicePool < diceRequired + 3) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px sans-serif';
        ctx.fillText(`(${dicePool - diceRequired} left)`, x + buttonWidth / 2, y + buttonHeight - 8);
      }
    }
  }

  private drawLevelUpOverlay(width: number, height: number) {
    const { ctx } = this;
    const elapsed = performance.now() - this.levelUpStartTime;
    const progress = Math.min(elapsed / LEVEL_UP_DURATION, 1);

    // Fade in/out overlay
    const alpha = progress < 0.3 ? progress / 0.3 * 0.3 : progress > 0.7 ? (1 - progress) / 0.3 * 0.3 : 0.3;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  start() {
    this.level = 1;
    this.boardSize = getBoardSizeForLevel(this.level);
    this.board = generateRingBoard(this.level);
    this.position = 0;
    this.score = 0;
    this.dicePool = getStartingDice(this.boardSize);
    this.lapProgress = 0;
    this.phase = GamePhase.Idle;
    this.lastRoll = 0;
    this.selectedDice = 0;
    this.diceAnimation = null;
    this.moveAnimation = null;
    this.isPaused = false;
    this.particles = [];
    this.floatingTexts = [];
    this.lowDiceWarningPulse = 0;

    this.api.setScore(0);
    this.api.sounds.gameStart();
    this.resize();
    this.render();

    // Start continuous effect animation for warning pulse
    this.animateEffects();
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
    } else if (this.phase === GamePhase.LevelUp) {
      this.animateLevelUp();
    } else {
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
