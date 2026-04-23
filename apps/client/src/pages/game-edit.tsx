import { GameForm } from '@/components/game-form';
import type { Game } from '@/types';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function GameEditPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGame(null);
    setError(null);
    fetch(`/api/games/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`request failed: ${r.status}`);
        return r.json() as Promise<Game>;
      })
      .then((g) => {
        if (!cancelled) setGame(g);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-apex-muted">
        Failed to load game: {error}
      </div>
    );
  }
  if (!game) return null;

  return <GameForm key={game.id} mode="edit" initialGame={game} />;
}
