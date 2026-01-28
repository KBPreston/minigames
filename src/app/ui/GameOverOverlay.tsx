import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Storage } from '../../core/Storage';
import { SoundEngine } from '../../core/SoundEngine';
import { useSettings } from '../../core/SettingsStore';

interface GameOverOverlayProps {
  gameId: string;
  finalScore: number;
  onPlayAgain: () => void;
}

export function GameOverOverlay({ gameId, finalScore, onPlayAgain }: GameOverOverlayProps) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const bestScore = Storage.getBestScore(gameId);
  const isNewBest = finalScore >= bestScore && finalScore > 0;

  // Play sounds on mount
  useEffect(() => {
    if (settings.sound) {
      if (isNewBest) {
        SoundEngine.newHighScore();
      } else {
        SoundEngine.gameOver();
      }
    }
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-2xl p-6 mx-4 max-w-sm w-full text-center animate-pop-in">
        <h2 className="text-2xl font-bold mb-2 font-display">Game Over</h2>

        {isNewBest && (
          <div className="mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-sm font-bold font-display animate-celebrate">
              <span className="text-base">🎉</span>
              New Best!
              <span className="text-base">🎉</span>
            </span>
          </div>
        )}

        <div className={`text-5xl font-extrabold mb-2 tabular-nums font-display ${isNewBest ? 'text-yellow-400 animate-glow-pulse' : ''}`}>
          {finalScore.toLocaleString()}
        </div>

        {bestScore > 0 && !isNewBest && (
          <div className="text-gray-400 text-sm mb-4 font-display">
            Best: {bestScore.toLocaleString()}
          </div>
        )}

        <div className="space-y-3 mt-6">
          <button
            onClick={() => {
              if (settings.sound) SoundEngine.uiClick();
              onPlayAgain();
            }}
            className="w-full py-3 bg-primary-500 hover:bg-primary-400 text-white font-bold font-display rounded-xl active:scale-[0.97] transition-all shadow-lg shadow-primary-500/25"
          >
            Play Again
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => {
                if (settings.sound) SoundEngine.uiBack();
                navigate('/');
              }}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl active:scale-98 transition-all"
            >
              Home
            </button>
            <button
              onClick={() => {
                if (settings.sound) SoundEngine.uiClick();
                navigate(`/leaderboard/${gameId}`);
              }}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <span className="text-yellow-400">🏆</span>
              Leaderboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
