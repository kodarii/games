import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { AppHeader } from '@/components/layout/app-header';
import { useExport } from '@/hooks/use-export';
import { useImport } from '@/hooks/use-import';
import type { ImportMode } from '@apex/shared';
import type { Platform } from '@/types';

export function DataPage() {
  return (
    <>
      <AppHeader>
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-apex-ink text-white">
          <Icon.rows size={15} className="text-white" />
        </span>
        <span className="text-[15px] font-bold text-apex-ink">Data</span>
      </AppHeader>
      <div className="flex-1 overflow-y-auto bg-[#fafafa] px-5 pb-4 pt-4">
        <div className="grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
          <ExportCard />
          <ImportCard />
        </div>
      </div>
    </>
  );
}

function ExportCard() {
  const { isExporting, error, trigger } = useExport();
  return (
    <div className="rounded-[12px] border border-apex-line-3 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-apex-surface-head text-apex-ink-4">
          <Icon.rows size={18} />
        </span>
        <div className="text-[15px] font-semibold text-apex-ink">Export to JSON</div>
      </div>
      <p className="mb-3 text-[13px] text-apex-muted">
        Download a snapshot of all your platforms and games. Useful for backups or migrating to another instance.
      </p>
      <ul className="mb-4 space-y-1 text-[12px] text-apex-muted">
        <li>• Includes platforms and games</li>
        <li>• Excludes internal IDs</li>
        <li>• Schema version 1</li>
      </ul>
      <button
        type="button"
        onClick={trigger}
        disabled={isExporting}
        className="w-full rounded-[8px] bg-apex-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {isExporting ? 'Exporting…' : 'Export to JSON'}
      </button>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

function ImportFilePicker({
  statKind,
  fileName,
  errorMsg,
  summary,
  onPick,
  onReset,
}: {
  statKind: string;
  fileName?: string;
  errorMsg?: string;
  summary?: { platforms: number; games: number; version: 1 | 2 | 'external' };
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mb-3">
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onPick}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-[8px] border border-apex-line-3 bg-white px-3 py-1.5 text-[13px] hover:bg-apex-surface-head"
        >
          Choose file…
        </button>
        <span className="text-[12px] text-apex-muted">
          {(statKind === 'idle' || statKind === 'parse-failed') && 'No file selected'}
          {statKind === 'parsing' && 'Reading…'}
          {(statKind === 'validated' || statKind === 'submitting') && fileName}
          {(statKind === 'succeeded' || statKind === 'failed') && (
            <button onClick={onReset} className="text-apex-accent hover:underline">
              Import another
            </button>
          )}
        </span>
      </div>
      {summary && (
        <p className="mt-2 text-[12px] text-green-600">
          ✓ Found {summary.platforms} platform{summary.platforms === 1 ? '' : 's'} and {summary.games} game{summary.games === 1 ? '' : 's'} ({summary.version === 'external' ? 'external format' : `schema v${summary.version}`}).
        </p>
      )}
      {errorMsg && <p className="mt-2 text-[12px] text-red-600">{errorMsg}</p>}
    </div>
  );
}

function ImportModeRadio({
  mode,
  onChange,
  disabled,
}: {
  mode: ImportMode;
  onChange: (m: ImportMode) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="mb-4 flex flex-col gap-2 sm:flex-row sm:gap-4">
      {(['merge', 'replace'] as ImportMode[]).map((m) => (
        <label key={m} className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name="import-mode"
            value={m}
            checked={mode === m}
            onChange={() => onChange(m)}
            disabled={disabled}
            className="mt-0.5"
          />
          <span>
            <div className="text-[13px] font-medium capitalize text-apex-ink">{m}</div>
            <div className="text-[11px] text-apex-muted">
              {m === 'merge' ? 'Update existing items, add new ones.' : 'Delete current data, then import.'}
            </div>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function ImportReplaceConfirm({
  open,
  onOpenChange,
  platformsCount,
  gamesCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  platformsCount: number | undefined;
  gamesCount: number | undefined;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[12px] bg-white p-5 shadow-xl">
          <AlertDialog.Title className="mb-2 text-[16px] font-semibold text-apex-ink">
            Replace all data?
          </AlertDialog.Title>
          <AlertDialog.Description className="mb-4 text-[13px] text-apex-muted">
            This will permanently delete{' '}
            <strong>
              {platformsCount ?? 'all'} platform{platformsCount === 1 ? '' : 's'}
            </strong>{' '}
            and{' '}
            <strong>
              {gamesCount ?? 'all'} game{gamesCount === 1 ? '' : 's'}
            </strong>{' '}
            and replace them with the contents of the file. This cannot be undone.
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button className="rounded-[8px] border border-apex-line-3 bg-white px-4 py-2 text-[13px] hover:bg-apex-surface-head">
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                className="rounded-[8px] bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700"
              >
                Replace
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function ImportCard() {
  const { state, selectFile, submit, reset } = useImport();
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const qc = useQueryClient();
  const platformsCount = qc.getQueryData<Platform[]>(['platforms'])?.length;
  const gamesCount: number | undefined = undefined;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await selectFile(f);
    e.target.value = '';
  };

  const onImportClick = () => {
    if (mode === 'replace') setConfirmOpen(true);
    else void submit('merge');
  };

  const onConfirmReplace = () => {
    setConfirmOpen(false);
    void submit('replace');
  };

  const isSubmitting = state.kind === 'submitting';
  const canSubmit = state.kind === 'validated' && !isSubmitting;
  const showControls = state.kind === 'validated' || state.kind === 'submitting';

  return (
    <div className="rounded-[12px] border border-apex-line-3 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-apex-surface-head text-apex-ink-4">
          <Icon.rows size={18} />
        </span>
        <div className="text-[15px] font-semibold text-apex-ink">Import from JSON</div>
      </div>
      <p className="mb-3 text-[13px] text-apex-muted">
        Restore platforms and games from a previously exported JSON file.
      </p>

      <ImportFilePicker
        statKind={state.kind}
        fileName={(state.kind === 'validated' || state.kind === 'submitting') ? state.file.name : undefined}
        errorMsg={state.kind === 'parse-failed' ? state.message : undefined}
        summary={(state.kind === 'validated' || state.kind === 'submitting') ? state.summary : undefined}
        onPick={onPick}
        onReset={reset}
      />

      {showControls && (
        <ImportModeRadio mode={mode} onChange={setMode} disabled={isSubmitting} />
      )}

      {showControls && (
        <button
          type="button"
          onClick={onImportClick}
          disabled={!canSubmit}
          className="w-full rounded-[8px] bg-apex-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          {isSubmitting ? 'Importing…' : 'Import'}
        </button>
      )}

      {state.kind === 'succeeded' && (
        <div className="mt-3 rounded-[8px] border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">
          <div className="font-semibold">Import complete</div>
          <div>
            Platforms — created: {state.report.platforms.created}, updated: {state.report.platforms.updated}
            {state.report.platforms.deleted !== undefined ? `, deleted: ${state.report.platforms.deleted}` : ''}
          </div>
          <div>
            Games — created: {state.report.games.created}, updated: {state.report.games.updated}
            {state.report.games.deleted !== undefined ? `, deleted: ${state.report.games.deleted}` : ''}
          </div>
        </div>
      )}

      {state.kind === 'failed' && (
        <p className="mt-2 text-[12px] text-red-600">{state.message}</p>
      )}

      <ImportReplaceConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        platformsCount={platformsCount}
        gamesCount={gamesCount}
        onConfirm={onConfirmReplace}
      />
    </div>
  );
}
