import { useState, useEffect } from 'react';
import { getGameMetadata } from '../../core/GameRegistry';
import { LeaderboardService } from '../../core/LeaderboardService';
import { GameCard } from '../ui/GameCard';
import { OptionsModal } from '../ui/OptionsModal';

interface TopScore {
  playerName: string;
  score: number;
}

export function Menu() {
  const games = getGameMetadata();
  const [ranks, setRanks] = useState<Record<string, number | null>>({});
  const [topScores, setTopScores] = useState<Record<string, TopScore | null>>({});
  const [loadingRanks, setLoadingRanks] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Fetch ranks and top scores once per session
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      const newRanks: Record<string, number | null> = {};
      const newTopScores: Record<string, TopScore | null> = {};

      for (const game of games) {
        if (game.disabled) continue;
        try {
          const [{ rankInTop }, topScore] = await Promise.all([
            LeaderboardService.fetchTopWithRank(game.id),
            LeaderboardService.fetchTopScore(game.id),
          ]);
          if (cancelled) return;
          newRanks[game.id] = rankInTop;
          newTopScores[game.id] = topScore;
        } catch {
          newRanks[game.id] = null;
          newTopScores[game.id] = null;
        }
      }

      if (!cancelled) {
        setRanks(newRanks);
        setTopScores(newTopScores);
        setLoadingRanks(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mini Games</h1>
            <p className="text-sm text-gray-400">Choose a game to play</p>
          </div>
          <button
            onClick={() => setOptionsOpen(true)}
            className="p-3 text-gray-400 hover:text-white transition-colors"
            aria-label="Settings"
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
      </header>

      {/* Game Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              rank={ranks[game.id]}
              topScore={topScores[game.id]}
              isLoadingRank={loadingRanks && !game.disabled}
            />
          ))}
        </div>
      </div>

      {/* Options Modal */}
      <OptionsModal isOpen={optionsOpen} onClose={() => setOptionsOpen(false)} />
    </div>
  );
}
