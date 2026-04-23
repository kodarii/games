import { Avatar } from '@/components/avatar';
import { Breadcrumb } from '@/components/breadcrumb';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { FormCard, FormSection } from '@/components/form-card';
import { FormField, FormFieldRow } from '@/components/form-field';
import { FormCancelButton, FormFooter, FormSubmitButton } from '@/components/form-footer';
import { FormValue } from '@/components/form-value';
import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { statusFor } from '@/lib/game-status';
import { useDeleteGameMutation, useGameQuery } from '@/lib/queries';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function GameViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { data: game, error } = useGameQuery(id);
  const deleteMutation = useDeleteGameMutation();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(Number(id));
      navigate('/games');
    } catch (e) {
      alert(`Failed to delete: ${e}`);
    }
  };

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-apex-muted">
        Failed to load game: {String(error)}
      </div>
    );
  }
  if (!game) return null;

  return (
    <>
      <PageHeader
        icon={<Icon.gamepad size={22} />}
        title={game.title}
        description={`${game.developer} · ${game.platform}`}
        actions={
          <IconButton aria-label="Notifications">
            <Icon.bell size={18} />
          </IconButton>
        }
      />

      <Breadcrumb items={[{ label: 'Games', to: '/games' }, { label: game.title }]} />

      <div className="scroll-thin flex-1 overflow-y-auto bg-white px-6 pb-6">
        <FormCard>
          <FormSection title="Game Details" description="Basic information about the game.">
            <Avatar shape="rect" size={56} name={game.title} className="mb-4" />

            <FormFieldRow cols={2}>
              <FormField label="Title">
                <FormValue>{game.title}</FormValue>
              </FormField>
              <FormField label="Developer">
                <FormValue>{game.developer}</FormValue>
              </FormField>
            </FormFieldRow>
            <FormFieldRow cols={2}>
              <FormField label="Genre">
                <FormValue>{game.genre}</FormValue>
              </FormField>
              <FormField label="Release Year">
                <FormValue>{String(game.releaseYear)}</FormValue>
              </FormField>
            </FormFieldRow>
          </FormSection>

          <FormSection title="Platform" description="Where you play this game.">
            <FormFieldRow cols={3}>
              <FormField label="Platform">
                <FormValue>{game.platform}</FormValue>
              </FormField>
              <FormField label="Edition">
                <FormValue>{game.edition ?? ''}</FormValue>
              </FormField>
              <FormField label="Hours Played">
                <FormValue>{String(game.hoursPlayed)}</FormValue>
              </FormField>
            </FormFieldRow>
          </FormSection>

          <FormSection title="Status">
            <StatusBadge {...statusFor(game.status)} />
          </FormSection>
        </FormCard>
      </div>

      <FormFooter>
        <button
          type="button"
          onClick={() => setDeleteDialogOpen(true)}
          disabled={deleteMutation.isPending}
          className="mr-auto rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        </button>
        <FormCancelButton onClick={() => navigate('/games')} />
        <FormSubmitButton onClick={() => navigate(`/games/${game.id}/edit`)}>Edit</FormSubmitButton>
      </FormFooter>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        gameTitle={game.title}
        isDeleting={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}
