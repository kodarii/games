import { AddDictionaryItemDialog } from '@/components/add-dictionary-item-dialog';
import { DataTable } from '@/components/data-table';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { developersColumns } from '@/components/dictionaries-developers-columns';
import { genresColumns } from '@/components/dictionaries-genres-columns';
import { platformsColumns } from '@/components/dictionaries-platforms-columns';
import { Icon } from '@/components/icons';
import { AppHeader } from '@/components/layout/app-header';
import { Toolbar, ToolbarSpacer } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  useCreateDeveloper,
  useCreateGenre,
  useCreatePlatform,
  useDeleteDeveloper,
  useDeleteGenre,
  useDeletePlatform,
  useDevelopersQuery,
  useGenresQuery,
  usePlatformsQuery,
} from '@/lib/queries';
import type { Developer, Genre, Platform } from '@/types';
import { getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Tab = 'platforms' | 'genres' | 'developers';

const TABS: { id: Tab; label: string }[] = [
  { id: 'platforms', label: 'Platforms' },
  { id: 'genres', label: 'Genres' },
  { id: 'developers', label: 'Developers' },
];

export function DictionariesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: Tab = (rawTab === 'genres' || rawTab === 'developers') ? rawTab : 'platforms';

  const setTab = (tab: Tab) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <>
      <AppHeader>
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-apex-ink text-white">
          <Icon.rows size={15} className="text-white" />
        </span>
        <span className="text-[15px] font-bold text-apex-ink">Dictionaries</span>
      </AppHeader>

      <div className="flex shrink-0 gap-0 border-b border-apex-line-3 bg-white px-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`relative px-4 py-[10px] text-[13px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-apex-accent'
                : 'text-apex-ink-4 hover:text-apex-ink'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-apex-accent" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'platforms' && <PlatformsTab />}
      {activeTab === 'genres' && <GenresTab />}
      {activeTab === 'developers' && <DevelopersTab />}
    </>
  );
}

function PlatformsTab() {
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Platform | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data = [], isLoading } = usePlatformsQuery();
  const createM = useCreatePlatform();
  const deleteM = useDeletePlatform();

  useEffect(() => { setDeleteError(null); }, []);

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
      onSuccess: () => { setPendingDelete(null); setDeleteError(null); },
      onError: (err) => {
        setPendingDelete(null);
        if (err instanceof ApiError && err.status === 409) setDeleteError('This platform is used by existing games and cannot be deleted.');
      },
    });
  };

  return (
    <TabContent
      isLoading={isLoading}
      isEmpty={!isLoading && data.length === 0}
      deleteError={deleteError}
      emptyState={{
        icon: <Icon.zap size={22} />,
        title: 'No platforms yet',
        description: 'Add your first platform to start categorizing your games.',
        action: <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}><Icon.plus size={13} />Add platform</Button>,
      }}
      toolbar={
        <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
          <Icon.plus size={13} />Add platform
        </Button>
      }
      table={<DataTable table={table} variant="default" />}
    >
      <AddDictionaryItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Platform"
        placeholder="e.g. PlayStation 5"
        maxLength={40}
        onCreate={async (name) => { await createM.mutateAsync({ name }); }}
        duplicateMessage={(name) => `Platform '${name}' already exists`}
      />
      <DeleteConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        gameTitle={pendingDelete?.name ?? ''}
        isDeleting={deleteM.isPending}
        onConfirm={handleDelete}
      />
    </TabContent>
  );
}

function GenresTab() {
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Genre | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data = [], isLoading } = useGenresQuery();
  const createM = useCreateGenre();
  const deleteM = useDeleteGenre();

  const table = useReactTable<Genre>({
    data,
    columns: genresColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      onDeleteGenre: (genre) => {
        setDeleteError(null);
        setPendingDelete(genre);
      },
    },
  });

  const handleDelete = () => {
    if (!pendingDelete) return;
    deleteM.mutate(pendingDelete.id, {
      onSuccess: () => { setPendingDelete(null); setDeleteError(null); },
      onError: (err) => {
        setPendingDelete(null);
        if (err instanceof ApiError && err.status === 409) setDeleteError('This genre is used by existing games and cannot be deleted.');
      },
    });
  };

  return (
    <TabContent
      isLoading={isLoading}
      isEmpty={!isLoading && data.length === 0}
      deleteError={deleteError}
      emptyState={{
        icon: <Icon.rows size={22} />,
        title: 'No genres yet',
        description: 'Add genres to organize your collection by type.',
        action: <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}><Icon.plus size={13} />Add genre</Button>,
      }}
      toolbar={
        <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
          <Icon.plus size={13} />Add genre
        </Button>
      }
      table={<DataTable table={table} variant="default" />}
    >
      <AddDictionaryItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Genre"
        placeholder="e.g. Action RPG"
        maxLength={40}
        onCreate={async (name) => { await createM.mutateAsync({ name }); }}
        duplicateMessage={(name) => `Genre '${name}' already exists`}
      />
      <DeleteConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        gameTitle={pendingDelete?.name ?? ''}
        isDeleting={deleteM.isPending}
        onConfirm={handleDelete}
      />
    </TabContent>
  );
}

function DevelopersTab() {
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Developer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data = [], isLoading } = useDevelopersQuery();
  const createM = useCreateDeveloper();
  const deleteM = useDeleteDeveloper();

  const table = useReactTable<Developer>({
    data,
    columns: developersColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      onDeleteDeveloper: (developer) => {
        setDeleteError(null);
        setPendingDelete(developer);
      },
    },
  });

  const handleDelete = () => {
    if (!pendingDelete) return;
    deleteM.mutate(pendingDelete.id, {
      onSuccess: () => { setPendingDelete(null); setDeleteError(null); },
      onError: (err) => {
        setPendingDelete(null);
        if (err instanceof ApiError && err.status === 409) setDeleteError('This developer is used by existing games and cannot be deleted.');
      },
    });
  };

  return (
    <TabContent
      isLoading={isLoading}
      isEmpty={!isLoading && data.length === 0}
      deleteError={deleteError}
      emptyState={{
        icon: <Icon.gamepad size={22} />,
        title: 'No developers yet',
        description: 'Track the studios behind your games.',
        action: <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}><Icon.plus size={13} />Add developer</Button>,
      }}
      toolbar={
        <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
          <Icon.plus size={13} />Add developer
        </Button>
      }
      table={<DataTable table={table} variant="default" />}
    >
      <AddDictionaryItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Developer"
        placeholder="e.g. FromSoftware"
        maxLength={60}
        onCreate={async (name) => { await createM.mutateAsync({ name }); }}
        duplicateMessage={(name) => `Developer '${name}' already exists`}
      />
      <DeleteConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        gameTitle={pendingDelete?.name ?? ''}
        isDeleting={deleteM.isPending}
        onConfirm={handleDelete}
      />
    </TabContent>
  );
}

interface TabContentProps {
  isLoading: boolean;
  isEmpty: boolean;
  deleteError: string | null;
  emptyState: {
    icon: React.ReactNode;
    title: string;
    description: string;
    action: React.ReactNode;
  };
  toolbar: React.ReactNode;
  table: React.ReactNode;
  children: React.ReactNode;
}

function TabContent({ isLoading, isEmpty, deleteError, emptyState, toolbar, table, children }: TabContentProps) {
  return (
    <>
      <Toolbar className="hidden sm:flex">
        <ToolbarSpacer />
        {toolbar}
      </Toolbar>

      {deleteError && (
        <div className="mx-5 mb-3 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {deleteError}
        </div>
      )}

      <div className="scroll-thin flex-1 overflow-y-auto bg-[#fafafa] px-5 pb-4 pt-3 sm:pt-1">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-apex-surface-head text-apex-muted">
              {emptyState.icon}
            </span>
            <div>
              <div className="text-[15px] font-semibold text-apex-ink">{emptyState.title}</div>
              <div className="mt-1 text-[13px] text-apex-muted">{emptyState.description}</div>
            </div>
            {emptyState.action}
          </div>
        ) : (
          table
        )}
      </div>

      <div className="sm:hidden fixed bottom-6 right-6 z-20 drop-shadow-lg">
        {toolbar}
      </div>

      {children}
    </>
  );
}
