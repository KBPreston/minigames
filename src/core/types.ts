export interface Settings {
  haptics: boolean;
  reduceMotion: boolean;
  playerName: string;
}

export interface GameAPI {
  setScore(score: number): void;
  gameOver(finalScore: number): void;
  getSettings(): Settings;
  onSettingsChanged(fn: () => void): () => void;
  haptics: {
    tap(): void;
    success(): void;
  };
}

export interface GameInstance {
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  destroy(): void;
}

export type GameFactory = (
  container: HTMLElement,
  api: GameAPI
) => GameInstance;

export interface GameMetadata {
  id: string;
  name: string;
  icon: string;
  disabled?: boolean;
}

export interface GameDefinition extends GameMetadata {
  factory: () => Promise<{ default: GameFactory }>;
}
