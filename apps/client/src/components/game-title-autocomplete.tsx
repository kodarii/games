import { Input } from '@/components/ui/input';
import { useGameTitleAutocomplete } from '@/hooks/use-game-title-autocomplete';
import { useIgdbStatusQuery } from '@/hooks/use-igdb-status';
import { cn } from '@/lib/utils';
import type { MetadataCandidate } from '@/types';
import { useEffect, useId, useRef, useState } from 'react';

const LISTBOX_MAX_VISIBLE = 8;

export interface GameTitleAutocompleteProps {
  value: string;
  onChange: (next: string) => void;
  onPick: (candidate: MetadataCandidate) => void;
  platform: string;
  /** False in `edit` mode — suppresses the dropdown entirely. */
  enabled: boolean;
  placeholder?: string;
}

/**
 * Combobox: a plain `<Input>` wired to IGDB autocomplete suggestions.
 *
 * Dropdown visibility gate (all must be true):
 *   - `enabled === true` (caller has opted in — typically `action === 'create'`)
 *   - IGDB status query resolved with `igdbConfigured === true`
 *   - a platform is selected
 *   - the input is focused (`open === true`)
 *   - the debounced trimmed title is at least 2 chars
 *
 * The component is intentionally stateless about the picked candidate — selection
 * lives in the owning form so submit can attach `metadataRef`.
 */
export function GameTitleAutocomplete({
  value,
  onChange,
  onPick,
  platform,
  enabled,
  placeholder,
}: GameTitleAutocompleteProps) {
  const statusQuery = useIgdbStatusQuery();
  const igdbConfigured = statusQuery.data?.igdbConfigured === true;
  const featureEnabled = enabled && igdbConfigured;

  const autocomplete = useGameTitleAutocomplete({
    title: value,
    platform,
    enabled: featureEnabled,
  });

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  // Outside click closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const node = wrapperRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const candidates = autocomplete.candidates.slice(0, LISTBOX_MAX_VISIBLE);
  const platformSelected = platform.length > 0;
  const titleLongEnough = autocomplete.debouncedTitle.length >= 2;
  const showDropdown = open && featureEnabled && platformSelected && titleLongEnough;

  // Reset highlight when the candidate list shape changes.
  useEffect(() => {
    setHighlightedIndex(candidates.length > 0 ? 0 : null);
  }, [candidates.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' && featureEnabled && platformSelected && titleLongEnough) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (candidates.length === 0) return;
      setHighlightedIndex((idx) => {
        if (idx == null) return 0;
        return (idx + 1) % candidates.length;
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (candidates.length === 0) return;
      setHighlightedIndex((idx) => {
        if (idx == null) return candidates.length - 1;
        return (idx - 1 + candidates.length) % candidates.length;
      });
      return;
    }
    if (e.key === 'Enter') {
      if (highlightedIndex == null) return;
      const picked = candidates[highlightedIndex];
      if (!picked) return;
      e.preventDefault();
      onPick(picked);
      setOpen(false);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
  };

  const onItemMouseDown = (candidate: MetadataCandidate) => (e: React.MouseEvent) => {
    // Prevent the input's blur from racing the click and closing the dropdown
    // before our pick handler runs.
    e.preventDefault();
    onPick(candidate);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showDropdown && highlightedIndex != null && candidates[highlightedIndex]
            ? `${listboxId}-${candidates[highlightedIndex].providerId}`
            : undefined
        }
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showDropdown && (
        <DropdownPanel
          listboxId={listboxId}
          state={resolveDropdownState(autocomplete, candidates)}
          highlightedIndex={highlightedIndex}
          onItemMouseDown={onItemMouseDown}
          setHighlightedIndex={setHighlightedIndex}
        />
      )}
    </div>
  );
}

type DropdownState =
  | { kind: 'loading' }
  | { kind: 'degraded' }
  | { kind: 'empty' }
  | { kind: 'list'; candidates: readonly MetadataCandidate[] };

function resolveDropdownState(
  autocomplete: ReturnType<typeof useGameTitleAutocomplete>,
  candidates: readonly MetadataCandidate[],
): DropdownState {
  if (autocomplete.isError) return { kind: 'degraded' };
  if (candidates.length > 0) return { kind: 'list', candidates };
  if (autocomplete.isLoading) return { kind: 'loading' };
  return { kind: 'empty' };
}

interface DropdownPanelProps {
  listboxId: string;
  state: DropdownState;
  highlightedIndex: number | null;
  onItemMouseDown: (candidate: MetadataCandidate) => (e: React.MouseEvent) => void;
  setHighlightedIndex: (index: number) => void;
}

function DropdownPanel({
  listboxId,
  state,
  highlightedIndex,
  onItemMouseDown,
  setHighlightedIndex,
}: DropdownPanelProps) {
  return (
    <div
      id={listboxId}
      // biome-ignore lint/a11y/useSemanticElements: ARIA combobox pattern requires role="listbox" on a non-semantic element; <select> cannot host rich custom rows.
      role="listbox"
      tabIndex={-1}
      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[7px] border border-apex-line-1 bg-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)] sm:max-h-72 max-sm:max-h-60"
    >
      {state.kind === 'loading' && <NoticeRow text="Searching IGDB…" spinner />}
      {state.kind === 'degraded' && <NoticeRow text="IGDB unavailable — continue manually" />}
      {state.kind === 'empty' && <NoticeRow text="No matches — type more or use your title" />}
      {state.kind === 'list' &&
        state.candidates.map((candidate, index) => (
          <CandidateRow
            key={candidate.providerId}
            id={`${listboxId}-${candidate.providerId}`}
            candidate={candidate}
            selected={index === highlightedIndex}
            onMouseDown={onItemMouseDown(candidate)}
            onMouseEnter={() => setHighlightedIndex(index)}
          />
        ))}
    </div>
  );
}

function NoticeRow({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-apex-muted">
      {spinner && (
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-apex-line-1 border-t-apex-accent"
        />
      )}
      {text}
    </div>
  );
}

interface CandidateRowProps {
  id: string;
  candidate: MetadataCandidate;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
}

function Thumb({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = src != null && !failed;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-apex-line-1">
      {showImage ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[9px] font-semibold uppercase tracking-wide text-apex-hint">
          {title.slice(0, 2)}
        </span>
      )}
    </div>
  );
}

function CandidateRow({ id, candidate, selected, onMouseDown, onMouseEnter }: CandidateRowProps) {
  const metaParts: string[] = [];
  if (candidate.developer) metaParts.push(candidate.developer);
  if (candidate.releaseYear != null) metaParts.push(String(candidate.releaseYear));
  const metaLine = metaParts.join(' · ');
  return (
    <div
      id={id}
      // biome-ignore lint/a11y/useSemanticElements: ARIA combobox option must use role="option" on a non-semantic element to host a rich row.
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex cursor-pointer items-center gap-3 px-3 py-2',
        selected ? 'bg-apex-line-5' : 'hover:bg-apex-line-5',
      )}
    >
      <Thumb src={candidate.coverImageUrl} title={candidate.title} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-apex-ink">{candidate.title}</div>
        {metaLine && <div className="truncate text-[11px] text-apex-muted">{metaLine}</div>}
      </div>
    </div>
  );
}
