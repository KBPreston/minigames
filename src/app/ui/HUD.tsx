import { useNavigate } from 'react-router-dom';
import { Storage } from '../../core/Storage';
import { SoundEngine } from '../../core/SoundEngine';
import { useSettings } from '../../core/SettingsStore';

interface HUDProps {
  gameId: string;
  gameName: string;
  score: number;
  onOptionsClick: () => void;
  onInfoClick: () => void;
}

export function HUD({ gameId, gameName, score, onOptionsClick, onInfoClick }: HUDProps) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const bestScore = Storage.getBestScore(gameId);

  const handleHomeClick = () => {
    if (settings.sound) SoundEngine.uiBack();
    navigate('/');
  };

  const handleInfoClick = () => {
    if (settings.sound) SoundEngine.uiOpen();
    onInfoClick();
  };

  const handleOptionsClick = () => {
    if (settings.sound) SoundEngine.uiOpen();
    onOptionsClick();
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-1">
        <button
          onClick={handleHomeClick}
          className="p-2 -m-2 text-white/80 hover:text-white active:scale-95 transition-all"
          aria-label="Home"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </button>
        <button
          onClick={handleInfoClick}
          className="p-2 text-white/80 hover:text-white active:scale-95 transition-all"
          aria-label="Game Info"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-sm font-semibold text-white/60 font-display">{gameName}</span>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold tabular-nums font-display">{score.toLocaleString()}</span>
          {bestScore > 0 && (
            <span className="text-sm text-primary-400/90 font-display font-semibold">
              Best: {bestScore.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleOptionsClick}
        className="p-2 -m-2 text-white/80 hover:text-white active:scale-95 transition-all"
        aria-label="Options"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
    </div>
  );
}
