import { useEffect, useRef, useState } from 'react';
import { getGameById } from './GameRegistry';
import { useSettings } from './SettingsStore';
import { Storage } from './Storage';
import { SoundEngine } from './SoundEngine';
import type { GameAPI, GameInstance, Settings } from './types';

interface GameHostProps {
  gameId: string;
  onScoreChange: (score: number) => void;
  onGameOver: (finalScore: number) => void;
  isPaused: boolean;
}

export function GameHost({ gameId, onScoreChange, onGameOver, isPaused }: GameHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<GameInstance | null>(null);
  const settingsListenersRef = useRef<Set<() => void>>(new Set());
  const { settings } = useSettings();
  const settingsRef = useRef<Settings>(settings);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep settings ref updated and sync sound volume
  useEffect(() => {
    settingsRef.current = settings;
    SoundEngine.setVolume(settings.soundVolume);
    settingsListenersRef.current.forEach((fn) => fn());
  }, [settings]);

  // Handle pause/resume
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    if (isPaused) {
      instance.pause();
    } else {
      instance.resume();
    }
  }, [isPaused]);

  // Initialize game
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const gameDef = getGameById(gameId);
    if (!gameDef || gameDef.disabled || !gameDef.factory) {
      setError('Game not found');
      setIsLoading(false);
      return;
    }

    let destroyed = false;

    const api: GameAPI = {
      setScore: (score: number) => {
        if (!destroyed) {
          onScoreChange(score);
        }
      },
      gameOver: (finalScore: number) => {
        if (!destroyed) {
          Storage.setBestScore(gameId, finalScore);
          onGameOver(finalScore);
        }
      },
      getSettings: () => settingsRef.current,
      onSettingsChanged: (fn: () => void) => {
        settingsListenersRef.current.add(fn);
        return () => {
          settingsListenersRef.current.delete(fn);
        };
      },
      haptics: {
        tap: () => {
          if (settingsRef.current.haptics && navigator.vibrate) {
            navigator.vibrate(10);
          }
        },
        success: () => {
          if (settingsRef.current.haptics && navigator.vibrate) {
            navigator.vibrate([10, 50, 10]);
          }
        },
      },
      sounds: {
        place: () => {
          if (settingsRef.current.sound) SoundEngine.place();
        },
        select: () => {
          if (settingsRef.current.sound) SoundEngine.select();
        },
        invalid: () => {
          if (settingsRef.current.sound) SoundEngine.invalid();
        },
        clearSingle: () => {
          if (settingsRef.current.sound) SoundEngine.clearSingle();
        },
        clearMulti: (count: number) => {
          if (settingsRef.current.sound) SoundEngine.clearMulti(count);
        },
        combo: (multiplier: number) => {
          if (settingsRef.current.sound) SoundEngine.combo(multiplier);
        },
        burst: () => {
          if (settingsRef.current.sound) SoundEngine.burst();
        },
        drop: () => {
          if (settingsRef.current.sound) SoundEngine.drop();
        },
        merge: (value: number) => {
          if (settingsRef.current.sound) SoundEngine.merge(value);
        },
        flood: (colorIndex?: number) => {
          if (settingsRef.current.sound) SoundEngine.flood(colorIndex);
        },
        regionClear: () => {
          if (settingsRef.current.sound) SoundEngine.regionClear();
        },
        roundComplete: () => {
          if (settingsRef.current.sound) SoundEngine.roundComplete();
        },
        gameStart: () => {
          if (settingsRef.current.sound) SoundEngine.gameStart();
        },
        gameOver: () => {
          if (settingsRef.current.sound) SoundEngine.gameOver();
        },
        newHighScore: () => {
          if (settingsRef.current.sound) SoundEngine.newHighScore();
        },
        warning: () => {
          if (settingsRef.current.sound) SoundEngine.warning();
        },
      },
    };

    gameDef
      .factory()
      .then((module) => {
        if (destroyed) return;
        const factory = module.default;
        const instance = factory(container, api);
        instanceRef.current = instance;
        setIsLoading(false);
        instance.start();
      })
      .catch((err) => {
        if (destroyed) return;
        console.error('Failed to load game:', err);
        setError('Failed to load game');
        setIsLoading(false);
      });

    return () => {
      destroyed = true;
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
      settingsListenersRef.current.clear();
    };
  }, [gameId, onScoreChange, onGameOver]);

  return (
    <div className="flex-1 w-full h-full relative overflow-hidden">
      {/* Always render container so game can mount */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ touchAction: 'none' }}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="animate-pulse text-white">Loading...</div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <p className="text-white">{error}</p>
        </div>
      )}
    </div>
  );
}
