import { Breadcrumb } from '@/components/breadcrumb';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { FormCancelButton, FormFooter, FormSubmitButton } from '@/components/form-footer';
import { GameCover } from '@/components/game-cover';
import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { SectionHeader } from '@/components/section-header';
import { StatusBadge } from '@/components/status-badge';
import { statusFor } from '@/lib/game-status';
import { useDeleteGameMutation, useGameQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { type ReactNode, useState } from 'react';
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

      <div className="scroll-thin flex-1 overflow-y-auto bg-white px-5 pb-6 pt-3 lg:px-8">
        <div className="overflow-hidden rounded-[14px] border border-apex-line-1 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
            <div className="flex items-center justify-center p-5 lg:border-r lg:border-apex-line-5 lg:p-6">
              <div className="w-full max-w-[260px] lg:max-w-none">
                <GameCover name={game.title} />
              </div>
            </div>

            <div className="flex flex-col">
              <div className="border-t border-apex-line-5 p-5 lg:border-t-0 lg:p-6">
                <SectionHeader
                  title="Game Details"
                  description="Basic information about the game."
                />
                <FieldGrid>
                  <Field label="Title" value={game.title} />
                  <Field label="Developer" value={game.developer} />
                  <Field label="Genre" value={game.genre} />
                  <Field label="Release Year" value={String(game.releaseYear)} />
                </FieldGrid>
              </div>

              <div className="border-t border-apex-line-5 p-5 lg:p-6">
                <SectionHeader title="Platform" description="Where you play this game." />
                <FieldGrid cols={3}>
                  <Field label="Platform" value={game.platform} />
                  <Field label="Edition" value={game.edition} />
                  <Field label="Hours Played" value={`${game.hoursPlayed} h`} />
                </FieldGrid>
              </div>

              <div className="border-t border-apex-line-5 p-5 lg:p-6">
                <SectionHeader title="Status" />
                <div className="text-[15px]">
                  <StatusBadge {...statusFor(game.status)} />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-apex-line-5 p-5 lg:p-6">
            <SectionHeader title="Notes" />
            <p className="text-[13px] leading-relaxed text-apex-faint">No notes yet.</p>
          </div>
        </div>
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

function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  const gridClass =
    cols === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2';
  return <dl className={cn('grid gap-x-6 gap-y-5', gridClass)}>{children}</dl>;
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-apex-muted">
        {label}
      </dt>
      <dd className="text-[15.5px] font-medium leading-snug text-apex-ink">
        {value ? value : <span className="text-apex-faint">—</span>}
      </dd>
    </div>
  );
}
