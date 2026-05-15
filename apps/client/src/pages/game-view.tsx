import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { GameViewActions } from '@/components/game-view/game-view-actions';
import { GameViewFields } from '@/components/game-view/game-view-fields';
import { GameViewHeader } from '@/components/game-view/game-view-header';
import { useGameDraft } from '@/hooks/use-game-draft';
import { coverColorFor } from '@/lib/avatar';
import {
  useDeleteGameMutation,
  useGameQuery,
  useMoveToCollectionMutation,
  usePlatformsQuery,
  useUpdateGameMutation,
} from '@/lib/queries';
import type { Game } from '@/types';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function GameViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: game, error } = useGameQuery(id);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-apex-muted">
        Failed to load game.
      </div>
    );
  }
  if (!game) return null;

  return <GameViewBody game={game} navigate={navigate} />;
}

function GameViewBody({
  game,
  navigate,
}: {
  game: Game;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const updateMutation = useUpdateGameMutation();
  const deleteMutation = useDeleteGameMutation();
  const moveMutation = useMoveToCollectionMutation();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [addPlatformOpen, setAddPlatformOpen] = useState(false);
  const { data: platforms = [], isLoading: platformsLoading } = usePlatformsQuery();

  const { draft, set, reset, toPayload } = useGameDraft(game);

  const startEdit = () => {
    reset();
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    reset();
  };

  const saveEdit = () => {
    if (!draft.platform) return;
    updateMutation.mutate(
      { id: game.id, input: toPayload({ kind: game.kind }) },
      {
        onSuccess: () => {
          setEditMode(false);
        },
      },
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(game.id, {
      onSuccess: () => {
        navigate(game.kind === 'wishlist' ? '/wishlist' : '/games');
      },
      onError: (err) => {
        alert(`Failed to delete: ${err.message}`);
      },
    });
  };

  const handleMove = () => {
    moveMutation.mutate(game.id, {
      onSuccess: () => navigate(`/games/${game.id}`),
    });
  };

  const liveTitle = editMode ? draft.title || game.title : game.title;
  const liveCoverColor = editMode ? draft.coverColor : coverColorFor(game);
  const liveCoverImage = editMode ? draft.coverImage : (game.coverImage ?? null);
  const subtitle = [game.developer, game.platform].filter(Boolean).join(' · ');
  const backPath = game.kind === 'wishlist' ? '/wishlist' : '/games';
  const backLabel = game.kind === 'wishlist' ? 'Wishlist' : 'Games';

  return (
    <>
      <GameViewHeader
        backPath={backPath}
        backLabel={backLabel}
        liveTitle={liveTitle}
        editMode={editMode}
        isSaving={updateMutation.isPending}
        onCancel={cancelEdit}
        onSave={saveEdit}
        onNavigate={(to) => navigate(to)}
        rightSlot={
          <GameViewActions
            kind={game.kind}
            isMovePending={moveMutation.isPending}
            onMove={handleMove}
            onEdit={startEdit}
            onDelete={() => setDeleteDialogOpen(true)}
          />
        }
      />

      <GameViewFields
        game={game}
        draft={draft}
        set={set}
        editMode={editMode}
        platforms={platforms}
        platformsLoading={platformsLoading}
        liveTitle={liveTitle}
        liveCoverColor={liveCoverColor}
        liveCoverImage={liveCoverImage}
        subtitle={subtitle}
        onAddPlatform={() => setAddPlatformOpen(true)}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        gameTitle={game.title}
        isDeleting={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      <AddPlatformDialog
        open={addPlatformOpen}
        onOpenChange={setAddPlatformOpen}
        onCreated={(p) => set('platform', p.name)}
      />
    </>
  );
}
