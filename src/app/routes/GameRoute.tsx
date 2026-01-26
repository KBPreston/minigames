import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGameById } from '../../core/GameRegistry';
import { GameHost } from '../../core/GameHost';
import { LeaderboardService } from '../../core/LeaderboardService';
import { useSettings } from '../../core/SettingsStore';
import { HUD } from '../ui/HUD';
import { OptionsModal } from '../ui/OptionsModal';
import { GameOverOverlay } from '../ui/GameOverOverlay';
import { GameInfoModal } from '../ui/GameInfoModal';

export function GameRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const hasSubmittedRef = useRef(false);

  const gameDef = id ? getGameById(id) : undefined;

  // Redirect if game not found
  useEffect(() => {
    if (!gameDef || gameDef.disabled) {
      navigate('/', { replace: true });
    }
  }, [gameDef, navigate]);

  const handleScoreChange = useCallback((newScore: number) => {
    setScore(newScore);
  }, []);

  const handleGameOver = useCallback(
    async (score: number) => {
      setFinalScore(score);
      setIsGameOver(true);

      // Submit to leaderboard
      if (!hasSubmittedRef.current && id && score > 0) {
        hasSubmittedRef.current = true;
        try {
          await LeaderboardService.submitBest(id, settings.playerName, score);
        } catch (err) {
          console.error('Failed to submit score:', err);
        }
      }
    },
    [id, settings.playerName]
  );

  const handlePlayAgain = useCallback(() => {
    setScore(0);
    setIsGameOver(false);
    setFinalScore(0);
    hasSubmittedRef.current = false;
    setGameKey((k) => k + 1);
  }, []);

  if (!gameDef) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <HUD
        gameId={gameDef.id}
        gameName={gameDef.name}
        score={score}
        onOptionsClick={() => setOptionsOpen(true)}
        onInfoClick={() => setInfoOpen(true)}
      />

      <GameHost
        key={gameKey}
        gameId={gameDef.id}
        onScoreChange={handleScoreChange}
        onGameOver={handleGameOver}
        isPaused={optionsOpen || isGameOver || infoOpen}
      />

      {isGameOver && (
        <GameOverOverlay
          gameId={gameDef.id}
          finalScore={finalScore}
          onPlayAgain={handlePlayAgain}
        />
      )}

      <OptionsModal isOpen={optionsOpen} onClose={() => setOptionsOpen(false)} />
      <GameInfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} gameId={gameDef.id} />
    </div>
  );
}
