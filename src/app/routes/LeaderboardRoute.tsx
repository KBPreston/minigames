import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGameById } from '../../core/GameRegistry';
import { LeaderboardService, LeaderboardEntry } from '../../core/LeaderboardService';
import { getFirebaseAuth } from '../../core/firebase';

export function LeaderboardRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const gameDef = id ? getGameById(id) : undefined;

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchLeaderboard() {
      try {
        const result = await LeaderboardService.fetchTopWithRank(id!, 50);
        setEntries(result.entries);
        setUserRank(result.rankInTop);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
        setError('Failed to load leaderboard');
      } finally {
        setIsLoading(false);
      }
    }

    fetchLeaderboard();
  }, [id]);

  if (!gameDef) {
    return null;
  }

  const currentUid = getFirebaseAuth()?.currentUser?.uid;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-4 py-3 bg-gray-900/80 backdrop-blur-sm flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -m-2 text-white/80 hover:text-white"
          aria-label="Back"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-bold">{gameDef.name} Leaderboard</h1>
          {userRank && (
            <p className="text-sm text-yellow-400">Your rank: #{userRank}</p>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-gray-400">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-400">{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-4xl mb-2">🏆</span>
            <p>No scores yet</p>
            <p className="text-sm">Be the first to play!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {entries.map((entry, index) => {
              const rank = index + 1;
              const isCurrentUser = entry.uid === currentUid;

              return (
                <div
                  key={entry.uid}
                  className={`flex items-center gap-4 px-4 py-3 ${
                    isCurrentUser ? 'bg-yellow-500/10' : ''
                  }`}
                >
                  {/* Rank */}
                  <div className="w-8 text-center">
                    {rank === 1 ? (
                      <span className="text-2xl">🥇</span>
                    ) : rank === 2 ? (
                      <span className="text-2xl">🥈</span>
                    ) : rank === 3 ? (
                      <span className="text-2xl">🥉</span>
                    ) : (
                      <span className="text-gray-400 font-medium">#{rank}</span>
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium truncate ${
                        isCurrentUser ? 'text-yellow-400' : 'text-white'
                      }`}
                    >
                      {entry.playerName}
                      {isCurrentUser && <span className="ml-2 text-xs">(You)</span>}
                    </p>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <span className="font-bold tabular-nums">{entry.score.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
