import { SidebarTrigger } from '@/components/ui/sidebar';

export interface GameViewHeaderProps {
  backPath: string;
  backLabel: string;
  liveTitle: string;
  editMode: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onNavigate: (to: string) => void;
  /**
   * Optional action cluster rendered on the right side when NOT in edit mode.
   * (In edit mode the header owns the Cancel/Save buttons.)
   */
  rightSlot?: React.ReactNode;
}

/**
 * Top bar of GameViewPage: SidebarTrigger + breadcrumb (backLabel · liveTitle) +
 * edit-mode CTA cluster (Cancel / Save) or `rightSlot` (e.g. <GameViewActions>).
 *
 * Stateless leaf: receives data and callbacks; renders.
 */
export function GameViewHeader({
  backPath,
  backLabel,
  liveTitle,
  editMode,
  isSaving,
  onCancel,
  onSave,
  onNavigate,
  rightSlot,
}: GameViewHeaderProps) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-apex-line-3 bg-white px-4 lg:px-5">
      <SidebarTrigger className="shrink-0 text-apex-ink-3 hover:text-apex-ink" />

      <nav className="flex min-w-0 items-center gap-[6px] text-[13px]">
        <button
          type="button"
          onClick={() => onNavigate(backPath)}
          className="shrink-0 font-medium text-apex-accent hover:underline"
        >
          {backLabel}
        </button>
        <span className="shrink-0 text-apex-line-1 select-none">·</span>
        <span className="truncate text-apex-ink-3">{liveTitle}</span>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {editMode ? (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-[7px] border border-apex-line-3 bg-white px-4 py-[6px] text-[12.5px] font-medium text-apex-ink-3 hover:bg-apex-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="cursor-pointer rounded-[7px] bg-apex-accent px-4 py-[6px] text-[12.5px] font-semibold text-white hover:bg-[#4562e0] disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          rightSlot
        )}
      </div>
    </div>
  );
}
