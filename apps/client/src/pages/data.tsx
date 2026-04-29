import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { useExport } from '@/hooks/use-export';

export function DataPage() {
  return (
    <>
      <PageHeader icon={<Icon.rows size={20} />} title="Data" />
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

function ImportCard() {
  return (
    <div className="rounded-[12px] border border-apex-line-3 bg-white p-5 opacity-70">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-apex-surface-head text-apex-ink-4">
          <Icon.rows size={18} />
        </span>
        <div className="text-[15px] font-semibold text-apex-ink">Import from JSON</div>
        <span className="ml-auto rounded-[6px] bg-apex-surface-head px-2 py-1 text-[11px] uppercase tracking-wide text-apex-muted">
          Coming soon
        </span>
      </div>
      <p className="text-[13px] text-apex-muted">
        Restore platforms and games from a previously exported JSON file.
      </p>
    </div>
  );
}
