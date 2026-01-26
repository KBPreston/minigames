import { useState } from 'react';
import { useSettings } from '../../core/SettingsStore';
import { Storage } from '../../core/Storage';
import { resetFirebaseIdentity } from '../../core/firebase';

interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OptionsModal({ isOpen, onClose }: OptionsModalProps) {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [isResetting, setIsResetting] = useState(false);
  const [nameInput, setNameInput] = useState(settings.playerName);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, 16);
    setNameInput(value);
  };

  const handleNameBlur = () => {
    const trimmed = nameInput.trim();
    if (trimmed.length >= 3) {
      updateSettings({ playerName: trimmed });
    } else {
      setNameInput(settings.playerName);
    }
  };

  const handleResetData = async () => {
    if (isResetting) return;

    const confirmed = window.confirm(
      'This will clear all local scores and create a new anonymous identity. Continue?'
    );
    if (!confirmed) return;

    setIsResetting(true);
    try {
      Storage.clearAll();
      resetSettings();
      await resetFirebaseIdentity();
      window.location.reload();
    } catch (err) {
      console.error('Reset failed:', err);
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div className="relative w-full max-w-lg bg-gray-800 rounded-t-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4">
          <h2 className="text-xl font-bold">Options</h2>
          <button
            onClick={onClose}
            className="p-2 -m-2 text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="px-6 pb-8 space-y-6">
          {/* Profile */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Profile
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Player Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={handleNameChange}
                  onBlur={handleNameBlur}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  placeholder="3-16 characters"
                  minLength={3}
                  maxLength={16}
                />
              </div>
            </div>
          </section>

          {/* Gameplay */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Gameplay
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-gray-200">Haptic Feedback</span>
                <button
                  role="switch"
                  aria-checked={settings.haptics}
                  onClick={() => updateSettings({ haptics: !settings.haptics })}
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    settings.haptics ? 'bg-primary-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.haptics ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </label>
            </div>
          </section>

          {/* Display */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Display
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-gray-200">Reduce Motion</span>
                <button
                  role="switch"
                  aria-checked={settings.reduceMotion}
                  onClick={() => updateSettings({ reduceMotion: !settings.reduceMotion })}
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    settings.reduceMotion ? 'bg-primary-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.reduceMotion ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </label>
            </div>
          </section>

          {/* Danger Zone */}
          <section>
            <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">
              Danger Zone
            </h3>
            <button
              onClick={handleResetData}
              disabled={isResetting}
              className="w-full py-3 bg-red-600/20 border border-red-600/50 text-red-400 rounded-lg hover:bg-red-600/30 disabled:opacity-50 transition-colors"
            >
              {isResetting ? 'Resetting...' : 'Reset Local Data'}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Clears all scores and creates a new anonymous identity
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
