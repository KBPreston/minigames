import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Storage } from './Storage';
import { generateRandomName } from './nameGenerator';
import type { Settings } from './types';

const SETTINGS_KEY = 'settings';

function getDefaultSettings(): Settings {
  return {
    haptics: true,
    sound: true,
    soundVolume: 50,
    reduceMotion: false,
    playerName: generateRandomName(),
  };
}

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (partial: Partial<Settings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const defaults = getDefaultSettings();
    const saved = Storage.get<Partial<Settings> | null>(SETTINGS_KEY, null);
    // Merge saved settings with defaults to handle new properties
    return saved ? { ...defaults, ...saved } : defaults;
  });

  useEffect(() => {
    Storage.set(SETTINGS_KEY, settings);
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(getDefaultSettings());
  }, []);

  const value: SettingsContextValue = {
    settings,
    updateSettings,
    resetSettings,
  };

  return React.createElement(SettingsContext.Provider, { value }, children);
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
