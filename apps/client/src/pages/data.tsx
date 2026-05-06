import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icons';
import { AppHeader } from '@/components/layout/app-header';
import { useExport } from '@/hooks/use-export';
import { useImport } from '@/hooks/use-import';
import type { ImportReport, ImportMode } from '@apex/shared';
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
      <div className="flex-1 overflow-y-auto bg-[#fafafa] px-6 pb-12 pt-6">
        <div className="max-w-[600px]">
          <SectionLabel>Export</SectionLabel>
          <ExportSection />

          <SectionLabel className="mt-8">Import</SectionLabel>
          <ImportSection />
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-apex-hint', className)}>
      {children}
    </div>
  );
}

function Row({
  label,
  description,
  extra,
  last = false,
  children,
}: {
  label: string;
  description?: string;
  extra?: React.ReactNode;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-6 py-5', !last && 'border-b border-apex-line-5')}>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-apex-ink">{label}</div>
        {description && (
          <div className="mt-[3px] text-[12.5px] leading-[1.5] text-apex-muted">{description}</div>
        )}
        {extra}
      </div>
      {children && <div className="shrink-0 pt-[2px]">{children}</div>}
    </div>
  );
}

function OutlineButton({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-[30px] rounded-[6px] border border-apex-line-3 bg-white px-3 text-[12.5px] text-apex-ink-3 transition-colors hover:bg-apex-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ExportSection() {
  const { isExporting, error, trigger } = useExport();

  return (
    <Row
      label="Export to JSON"
      description="Download all platforms and games as a JSON snapshot."
      last
      extra={
        error && (
          <p className="mt-1 text-[12px] text-apex-status-inactive">{error}</p>
        )
      }
    >
      <OutlineButton onClick={trigger} disabled={isExporting}>
        {isExporting ? 'Exporting…' : 'Export to JSON'}
      </OutlineButton>
    </Row>
  );
}

function ImportSection() {
  const { state, selectFile, submit, reset } = useImport();
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const platformsCount = qc.getQueryData<Platform[]>(['platforms'])?.length;

  const isSubmitting = state.kind === 'submitting';
  const showControls = state.kind === 'validated' || state.kind === 'submitting';

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await selectFile(f);
    e.target.value = '';
  };

  const onImportClick = () => {
    if (mode === 'replace') setConfirmOpen(true);
    else void submit('merge');
  };

  if (state.kind === 'succeeded') {
    return (
      <ImportResultRow
        label="Import complete"
        detail={formatReport(state.report)}
        onReset={reset}
        resetLabel="Import another"
      />
    );
  }

  if (state.kind === 'failed') {
    return (
      <ImportResultRow
        label="Import failed"
        detail={state.message}
        onReset={reset}
        resetLabel="Try again"
        isError
      />
    );
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onPick}
      />

      <Row
        label="Source file"
        description="Accepts JSON exports (v1–v4) or external format."
        last={!showControls}
        extra={
          state.kind === 'parse-failed' ? (
            <p className="mt-1 text-[12px] text-apex-status-inactive">{state.message}</p>
          ) : showControls ? (
            <p className="mt-1 text-[12px] text-apex-muted">
              {state.summary.platforms} platform{state.summary.platforms !== 1 ? 's' : ''}&nbsp;·&nbsp;
              {state.summary.games} game{state.summary.games !== 1 ? 's' : ''}&nbsp;·&nbsp;
              {state.summary.version === 'external' ? 'external format' : `schema v${state.summary.version}`}
            </p>
          ) : null
        }
      >
        {showControls ? (
          <div className="flex items-center gap-2">
            <span className="max-w-[150px] truncate text-[12.5px] text-apex-ink-3">
              {state.file.name}
            </span>
            <button
              type="button"
              onClick={reset}
              disabled={isSubmitting}
              aria-label="Remove file"
              className="text-[16px] leading-none text-apex-hint transition-colors hover:text-apex-ink-3 disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ) : state.kind === 'parsing' ? (
          <span className="text-[12.5px] text-apex-muted">Reading…</span>
        ) : (
          <OutlineButton onClick={() => fileRef.current?.click()}>
            Choose file…
          </OutlineButton>
        )}
      </Row>

      {showControls && (
        <>
          <Row label="Import mode" description="Merge keeps existing data and adds new items. Replace deletes everything first." last>
            <div className="flex overflow-hidden rounded-[6px] border border-apex-line-3">
              {(['merge', 'replace'] as const).map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={isSubmitting}
                  className={cn(
                    'h-[30px] px-3 text-[12.5px] capitalize transition-colors disabled:opacity-50',
                    i > 0 && 'border-l border-apex-line-3',
                    mode === m
                      ? 'bg-apex-surface-head font-medium text-apex-ink'
                      : 'bg-white text-apex-ink-5 hover:bg-apex-surface-hover',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </Row>

          <div className="flex items-center justify-end pt-4">
            <button
              type="button"
              onClick={onImportClick}
              disabled={isSubmitting || state.kind !== 'validated'}
              className="h-[30px] rounded-[6px] bg-apex-accent px-4 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? 'Importing…' : 'Import'}
            </button>
          </div>
        </>
      )}

      <ImportReplaceConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        platformsCount={platformsCount}
        onConfirm={() => {
          setConfirmOpen(false);
          void submit('replace');
        }}
      />
    </>
  );
}

function ImportResultRow({
  label,
  detail,
  onReset,
  resetLabel,
  isError = false,
}: {
  label: string;
  detail: string;
  onReset: () => void;
  resetLabel: string;
  isError?: boolean;
}) {
  return (
    <Row
      label={label}
      last
      extra={
        <p className={cn('mt-[3px] text-[12.5px] leading-[1.5]', isError ? 'text-apex-status-inactive' : 'text-apex-muted')}>
          {detail}
        </p>
      }
    >
      <button
        type="button"
        onClick={onReset}
        className="text-[12.5px] text-apex-accent hover:underline"
      >
        {resetLabel}
      </button>
    </Row>
  );
}

function formatReport(report: ImportReport): string {
  const p = report.platforms;
  const g = report.games;
  const parts: string[] = [];

  const pParts = [`created ${p.created}`, `updated ${p.updated}`];
  if (p.deleted !== undefined) pParts.push(`deleted ${p.deleted}`);
  parts.push(`Platforms: ${pParts.join(', ')}.`);

  const gParts = [`created ${g.created}`, `updated ${g.updated}`];
  if (g.deleted !== undefined) gParts.push(`deleted ${g.deleted}`);
  parts.push(`Games: ${gParts.join(', ')}.`);

  return parts.join(' ');
}

function ImportReplaceConfirm({
  open,
  onOpenChange,
  platformsCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  platformsCount: number | undefined;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[10px] bg-white p-5 shadow-apex-2">
          <AlertDialog.Title className="mb-2 text-[14px] font-semibold text-apex-ink">
            Replace all data?
          </AlertDialog.Title>
          <AlertDialog.Description className="mb-5 text-[13px] leading-[1.6] text-apex-muted">
            This will permanently delete{' '}
            <span className="text-apex-ink-2">
              {platformsCount !== undefined ? `${platformsCount} platform${platformsCount === 1 ? '' : 's'}` : 'all platforms'}
            </span>{' '}
            and all associated games, then replace them with the contents of the file. This cannot be undone.
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button className="h-[30px] rounded-[6px] border border-apex-line-3 bg-white px-3 text-[12.5px] text-apex-ink-3 hover:bg-apex-surface-hover">
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                className="h-[30px] rounded-[6px] bg-red-600 px-3 text-[12.5px] font-semibold text-white hover:bg-red-700"
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
