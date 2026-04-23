import { GameForm } from '@/components/game-form';
import { useParams } from 'react-router-dom';
import { useGameQuery } from '@/lib/queries';

export function GameEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data: game, error } = useGameQuery(id);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-apex-muted">
        Failed to load game: {String(error)}
      </div>
    );
  }
  if (!game) return null;

  return <GameForm key={game.id} mode="edit" initialGame={game} />;
}