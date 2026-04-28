import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { Breadcrumb } from '@/components/breadcrumb';
import { DataTable } from '@/components/data-table';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { platformsColumns } from '@/components/dictionaries-platforms-columns';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Toolbar, ToolbarSpacer } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
import { useDeletePlatform, usePlatformsQuery } from '@/lib/queries';
import type { Platform } from '@/types';
import { getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { useState } from 'react';

export function DictionariesPlatformsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Platform | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data = [], isLoading } = usePlatformsQuery();
  const deleteM = useDeletePlatform();

  const table = useReactTable<Platform>({
    data,
    columns: platformsColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      onDeletePlatform: (platform) => {
        setDeleteError(null);
        setPendingDelete(platform);
      },
    },
  });

  const handleDelete = () => {
    if (!pendingDelete) return;
    deleteM.mutate(pendingDelete.id, {
      onSuccess: () => {
        setPendingDelete(null);
        setDeleteError(null);
      },
      onError: (err: any) => {
        if (err?.status === 409) {
          setPendingDelete(null);
          setDeleteError('Platform is used by existing games and cannot be deleted.');
        }
      },
    });
  };

  return (
    <>
      <PageHeader
        icon={<Icon.zap size={20} />}
        title="Platforms"
      />
      <Breadcrumb
        items={[
          { label: 'Dictionaries', to: '/dictionaries' },
          { label: 'Platforms' },
        ]}
      />

      <Toolbar>
        <ToolbarSpacer />
        <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
          <Icon.plus size={13} />
          Add platform
        </Button>
      </Toolbar>

      {deleteError && (
        <div className="mx-5 mb-3 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {deleteError}
        </div>
      )}

      <div className="scroll-thin flex-1 overflow-y-auto bg-[#fafafa] px-5 pb-4 pt-1">
        {!isLoading && data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-apex-surface-head text-apex-muted">
              <Icon.zap size={24} />
            </span>
            <div>
              <div className="text-[15px] font-semibold text-apex-ink">No platforms yet</div>
              <div className="mt-1 text-[13px] text-apex-muted">
                Add your first platform to start categorizing your games.
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Icon.plus size={13} />
              Add your first platform
            </Button>
          </div>
        ) : (
          <DataTable table={table} variant="default" />
        )}
      </div>

      <AddPlatformDialog open={addOpen} onOpenChange={setAddOpen} />

      <DeleteConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        gameTitle={pendingDelete?.name ?? ''}
        isDeleting={deleteM.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}
