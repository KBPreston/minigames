import { useNavigate } from 'react-router-dom';
import { Storage } from '../../core/Storage';
import { SoundEngine } from '../../core/SoundEngine';
import { useSettings } from '../../core/SettingsStore';
import type { GameMetadata } from '../../core/types';

interface TopScore {
  playerName: string;
  score: number;
}

interface GameCardProps {
  game: GameMetadata;
  rank?: number | null;
  topScore?: TopScore | null;
  isLoadingRank?: boolean;
}

export function GameCard({ game, rank, topScore, isLoadingRank }: GameCardProps) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const bestScore = Storage.getBestScore(game.id);

  const handlePlay = () => {
    if (!game.disabled) {
      if (settings.sound) SoundEngine.uiClick();
      navigate(`/game/${game.id}`);
    }
  };

  const handleLeaderboard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!game.disabled) {
      if (settings.sound) SoundEngine.uiClick();
      navigate(`/leaderboard/${game.id}`);
    }
  };

  const isTopPlayer = rank === 1 && bestScore > 0;

  return (
    <div
      onClick={handlePlay}
      className={`relative bg-gray-700/50 rounded-2xl p-4 transition-all flex flex-col ${
        game.disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-gray-700 active:scale-98 cursor-pointer'
      }`}
    >
      {/* Header: Icon + Name */}
      <div className="flex items-start gap-3 mb-3">
        <div className="text-3xl">{game.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base leading-tight">{game.name}</h3>
          {!game.disabled && bestScore > 0 && (
            <div className="text-xs text-gray-400 mt-0.5">
              {bestScore.toLocaleString()} pts
            </div>
          )}
        </div>
        {/* Crown for #1 */}
        {isTopPlayer && (
          <div className="text-yellow-400 text-lg" title="You're #1!">👑</div>
        )}
      </div>

      {/* Stats Section */}
      {!game.disabled && (
        <div
          onClick={handleLeaderboard}
          className="mt-auto pt-2 border-t border-gray-600/50 cursor-pointer hover:bg-gray-600/30 -mx-4 -mb-4 px-4 pb-3 pt-2 rounded-b-2xl transition-colors"
        >
          {isLoadingRank ? (
            <div className="flex items-center gap-2">
              <div className="h-4 bg-gray-600 rounded animate-pulse flex-1" />
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs">
              {/* Your rank */}
              <div className="text-gray-400">
                {rank ? (
                  <span>
                    You: <span className={rank <= 3 ? 'text-yellow-400 font-medium' : 'text-gray-300'}>#{rank}</span>
                  </span>
                ) : bestScore > 0 ? (
                  <span className="text-gray-500">Unranked</span>
                ) : (
                  <span className="text-gray-500">No score</span>
                )}
              </div>

              {/* Leader */}
              {topScore && !isTopPlayer && (
                <div className="text-gray-500 truncate ml-2 text-right">
                  <span className="text-yellow-500/70">①</span>{' '}
                  <span className="text-gray-400">{topScore.playerName}</span>
                </div>
              )}

              {/* Leaderboard arrow */}
              <svg className="w-4 h-4 text-gray-500 ml-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Disabled badge */}
      {game.disabled && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gray-800/50">
          <span className="text-sm text-gray-500">Coming Soon</span>
        </div>
      )}
    </div>
  );
}
