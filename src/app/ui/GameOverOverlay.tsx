import { useNavigate } from 'react-router-dom';
import { Storage } from '../../core/Storage';

interface GameOverOverlayProps {
  gameId: string;
  finalScore: number;
  onPlayAgain: () => void;
}

export function GameOverOverlay({ gameId, finalScore, onPlayAgain }: GameOverOverlayProps) {
  const navigate = useNavigate();
  const bestScore = Storage.getBestScore(gameId);
  const isNewBest = finalScore >= bestScore && finalScore > 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-2xl p-6 mx-4 max-w-sm w-full text-center animate-pop-in">
        <h2 className="text-2xl font-bold mb-2">Game Over</h2>

        {isNewBest && (
          <div className="text-yellow-400 text-sm font-semibold mb-2 animate-pulse">
            New Best Score!
          </div>
        )}

        <div className="text-5xl font-bold mb-2 tabular-nums">
          {finalScore.toLocaleString()}
        </div>

        {bestScore > 0 && !isNewBest && (
          <div className="text-gray-400 text-sm mb-4">
            Best: {bestScore.toLocaleString()}
          </div>
        )}

        <div className="space-y-3 mt-6">
          <button
            onClick={onPlayAgain}
            className="w-full py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl active:scale-98 transition-all"
          >
            Play Again
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl active:scale-98 transition-all"
            >
              Home
            </button>
            <button
              onClick={() => navigate(`/leaderboard/${gameId}`)}
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
