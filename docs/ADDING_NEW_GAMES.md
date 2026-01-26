# Adding New Mini Games

This guide explains how to add a new mini game to the Mini Game Hub.

## Quick Start

1. Create a new folder: `src/games/your-game-name/`
2. Add the required files (see structure below)
3. Register in `GameRegistry.ts`
4. Add rules to `GameInfoModal.tsx`

## File Structure

```
src/games/your-game-name/
├── index.ts          # Factory export (required)
├── YourGameName.ts   # Main game class (required)
├── logic.ts          # Game logic/rules (optional)
├── pieces.ts         # Piece definitions (optional)
└── renderer.ts       # Rendering helpers (optional)
```

## Required Files

### index.ts

```typescript
import type { GameAPI, GameInstance, GameFactory } from '../../core/types';
import { YourGameName } from './YourGameName';

const factory: GameFactory = (container: HTMLElement, api: GameAPI): GameInstance => {
  return new YourGameName(container, api);
};

export default factory;
```

### YourGameName.ts (Main Game Class)

```typescript
import type { GameAPI, GameInstance } from '../../core/types';

export class YourGameName implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private score: number = 0;
  private isPaused: boolean = false;
  private isDestroyed: boolean = false;

  constructor(container: HTMLElement, api: GameAPI) {
    this.container = container;
    this.api = api;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    // Setup
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

    this.render();
  };

  private setupEventListeners() {
    // Add touch/mouse event listeners
    this.canvas.addEventListener('click', this.handleClick);
  }

  private handleClick = (e: MouseEvent) => {
    if (this.isPaused) return;
    // Handle click
  };

  private render() {
    // IMPORTANT: Guard against rendering before initialization
    if (this.isDestroyed || !this.isInitialized()) return;

    // Render game state
  }

  private isInitialized(): boolean {
    // Return true if game state is ready to render
    return true;
  }

  // Required GameInstance methods:

  start() {
    // Initialize game state
    this.score = 0;
    this.isPaused = false;
    this.api.setScore(0);
    this.render();
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this.render();
  }

  reset() {
    this.start();
  }

  destroy() {
    this.isDestroyed = true;
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.remove();
  }
}
```

## GameAPI Reference

The `api` object provides these methods:

```typescript
interface GameAPI {
  // Update the displayed score
  setScore(score: number): void;

  // Call when game ends - triggers game over overlay
  gameOver(finalScore: number): void;

  // Get current user settings
  getSettings(): Settings;

  // Subscribe to settings changes
  onSettingsChanged(fn: () => void): () => void;

  // Haptic feedback (mobile)
  haptics: {
    tap(): void;      // Light feedback
    success(): void;  // Success pattern
  };
}
```

## Register the Game

### 1. Add to GameRegistry.ts

```typescript
// src/core/GameRegistry.ts
export const GAMES: GameDefinition[] = [
  // ... existing games
  {
    id: 'your-game-id',
    name: 'Your Game Name',
    icon: '🎮',  // Emoji icon
    factory: () => import('../games/your-game-name'),
  },
];
```

### 2. Add Rules to GameInfoModal.tsx

```typescript
// src/app/ui/GameInfoModal.tsx
const GAME_RULES: Record<string, { title: string; rules: string[] }> = {
  // ... existing games
  'your-game-id': {
    title: 'Your Game Name',
    rules: [
      'Rule 1: How to play',
      'Rule 2: Scoring',
      'Rule 3: Win/lose conditions',
    ],
  },
};
```

## Best Practices

### Rendering
- Always check `isDestroyed` and initialization state before rendering
- Use `requestAnimationFrame` for animations
- Scale canvas by `devicePixelRatio` for crisp rendering

### Input Handling
- Check `isPaused` before processing input
- Support both touch and mouse events
- Use `api.haptics.tap()` for feedback

### Game State
- Call `api.setScore()` whenever score changes
- Call `api.gameOver(finalScore)` to end the game
- Respect pause/resume lifecycle

### Defeat Conditions
Every game should have a clear defeat condition:
- **Bloom Burst / Block Blast**: No valid placement for any piece
- **Snap Merge**: No possible merges and grid is full
- **Color Flood**: Run out of moves before filling the board

## Testing

1. Run `npm run dev`
2. Navigate to your game from the menu
3. Test the info button (ℹ️) shows your rules
4. Verify game over triggers correctly
5. Test pause/resume (open options menu)
6. Test play again functionality
