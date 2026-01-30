export interface Settings {
  haptics: boolean;
  sound: boolean;
  soundVolume: number; // 0-100
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
  sounds: {
    place(): void;
    select(): void;
    invalid(): void;
    clearSingle(): void;
    clearMulti(count: number): void;
    combo(multiplier: number): void;
    burst(): void;
    drop(): void;
    merge(value: number): void;
    flood(colorIndex?: number): void;
    regionClear(): void;
    roundComplete(): void;
    gameStart(): void;
    gameOver(): void;
    newHighScore(): void;
    warning(): void;
    coinClink(intensity?: number): void;
    coinCollect(): void;
    coinCascade(count: number): void;
    tierUp(): void;
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
