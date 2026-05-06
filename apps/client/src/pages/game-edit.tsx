import { GameForm } from '@/components/game-form';
import { useGameQuery } from '@/lib/queries';
import { useLocation, useParams } from 'react-router-dom';

export function GameEditPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { data: game, error } = useGameQuery(id);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-apex-muted">
        Failed to load game: {String(error)}
      </div>
    );
  }
  if (!game) return null;

  const mode = game.kind ?? (location.pathname.startsWith('/wishlist/') ? 'wishlist' : 'owned');

  return <GameForm key={game.id} action="edit" mode={mode} initialGame={game} />;
}
