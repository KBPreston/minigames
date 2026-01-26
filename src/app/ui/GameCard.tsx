import { useNavigate } from 'react-router-dom';
import { Storage } from '../../core/Storage';
import type { GameMetadata } from '../../core/types';

interface GameCardProps {
  game: GameMetadata;
  rank?: number | null;
  isLoadingRank?: boolean;
}

export function GameCard({ game, rank, isLoadingRank }: GameCardProps) {
  const navigate = useNavigate();
  const bestScore = Storage.getBestScore(game.id);

  const handlePlay = () => {
    if (!game.disabled) {
      navigate(`/game/${game.id}`);
    }
  };

  const handleLeaderboard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!game.disabled) {
      navigate(`/leaderboard/${game.id}`);
    }
  };

  return (
    <div
      onClick={handlePlay}
      className={`relative bg-gray-700/50 rounded-2xl p-4 transition-all ${
        game.disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-gray-700 active:scale-98 cursor-pointer'
      }`}
    >
      {/* Icon */}
      <div className="text-4xl mb-3">{game.icon}</div>

      {/* Name */}
      <h3 className="font-semibold text-lg mb-1">{game.name}</h3>

      {/* Score & Rank */}
      {!game.disabled && (
        <div className="flex items-center justify-between mt-2">
          <div className="text-sm text-gray-400">
            {bestScore > 0 ? (
              <span>Best: {bestScore.toLocaleString()}</span>
            ) : (
              <span>No score yet</span>
            )}
          </div>

          {/* Rank indicator */}
          {isLoadingRank ? (
            <div className="w-8 h-4 bg-gray-600 rounded animate-pulse" />
          ) : rank ? (
            <div className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full font-medium">
              #{rank}
            </div>
          ) : null}
        </div>
      )}

      {/* Leaderboard Button */}
      {!game.disabled && (
        <button
          onClick={handleLeaderboard}
          className="absolute top-3 right-3 p-2 text-yellow-400/60 hover:text-yellow-400 transition-colors"
          aria-label={`${game.name} leaderboard`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
          </svg>
        </button>
      )}

      {/* Disabled badge */}
      {game.disabled && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-gray-500">Coming Soon</span>
        </div>
      )}
    </div>
  );
}
