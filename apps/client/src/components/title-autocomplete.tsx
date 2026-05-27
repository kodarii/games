import { Icon } from '@/components/icons';
import { initials } from '@/lib/avatar';
import type { useMetadataCandidatesQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { MetadataCandidate } from '@/types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FOOTER_RESERVE = 28;

interface TitleAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  candidatesQuery: ReturnType<typeof useMetadataCandidatesQuery>;
  selectedCandidate: MetadataCandidate | null;
  onSelectCandidate: (c: MetadataCandidate) => void;
  fallbackColor: string;
  onSubmitEnter: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  placeholder?: string;
}

/**
 * Title field with inline IGDB autocomplete dropdown.
 *
 * Visual & UX rules locked by `260513-ds2-PLAN.md`:
 *  - Show dropdown only when input is focused AND value.trim().length >= 2 AND
 *    candidatesQuery returned >=1 candidate. Loading/degraded -> render nothing.
 *  - Selecting a candidate fires `onSelectCandidate(c)`; the parent then sets
 *    `value` to candidate.title AND records the provider id. Editing the value
 *    afterward clears the selection (handled in the hook).
 *  - Mouse selection uses `onMouseDown` (not onClick) so the dropdown does not
 *    blur-close before the click registers.
 *  - Esc closes the dropdown but does NOT bubble to Radix AlertDialog (we call
 *    stopPropagation). Enter without highlight (or dropdown closed) triggers
 *    the modal's primary CTA via `onSubmitEnter`.
 */
export function TitleAutocomplete({
  value,
  onChange,
  candidatesQuery,
  selectedCandidate,
  onSelectCandidate,
  fallbackColor,
  onSubmitEnter,
  inputRef,
  placeholder,
}: TitleAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const usedRef = inputRef ?? ownInputRef;
  const touchStartYRef = useRef<number | null>(null);

  const candidates = candidatesQuery.data?.candidates ?? [];
  const trimmed = value.trim();
  const showDropdown =
    focused &&
    trimmed.length >= 2 &&
    candidates.length > 0 &&
    !candidatesQuery.isError &&
    !(candidatesQuery.data?.degraded === true);

  // Reset highlight whenever the candidate list shape changes so the cursor
  // does not get stuck at an out-of-range index.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setHighlight is stable; we intentionally re-run only on candidates.length change.
  useEffect(() => {
    setHighlight(0);
  }, [candidates.length]);

  // Dropdown is portaled to <body> with fixed positioning so it escapes the
  // AlertDialog's `overflow-y-auto` clip (otherwise long suggestion lists get
  // cut at the modal boundary). Track the input's viewport rect and flip the
  // dropdown above the input when the on-screen keyboard (mobile) leaves too
  // little space below — `visualViewport` is what shrinks, not `innerHeight`.
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: 'below' | 'above';
  } | null>(null);
  useLayoutEffect(() => {
    if (!showDropdown) {
      setAnchor(null);
      return;
    }
    const measure = () => {
      const el = usedRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const vvTop = vv?.offsetTop ?? 0;
      const vvBottom = vvTop + (vv?.height ?? window.innerHeight);
      const GAP = 4;
      const MARGIN = 8;
      const MIN_USABLE = 140;
      const PREFERRED = 260;
      const spaceBelow = vvBottom - r.bottom - GAP - MARGIN;
      const spaceAbove = r.top - vvTop - GAP - MARGIN;
      const fitsBelow = spaceBelow >= MIN_USABLE;
      const preferAbove = !fitsBelow && spaceAbove > spaceBelow;
      if (preferAbove) {
        setAnchor({
          top: r.top - GAP,
          left: r.left,
          width: r.width,
          maxHeight: Math.min(PREFERRED, Math.max(MIN_USABLE, spaceAbove)),
          placement: 'above',
        });
      } else {
        setAnchor({
          top: r.bottom + GAP,
          left: r.left,
          width: r.width,
          maxHeight: Math.min(PREFERRED, Math.max(MIN_USABLE, spaceBelow)),
          placement: 'below',
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [showDropdown, usedRef]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter') {
        const pick = candidates[highlight];
        if (pick) {
          e.preventDefault();
          onSelectCandidate(pick);
          setFocused(false);
          return;
        }
      }
      if (e.key === 'Escape') {
        // Close dropdown only; don't let Radix AlertDialog close the modal.
        e.preventDefault();
        e.stopPropagation();
        setFocused(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmitEnter();
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-apex-hint">
          <Icon.search size={14} />
        </span>
        <input
          ref={usedRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Defer blur so an onMouseDown row click still fires before we tear
            // the dropdown down. setTimeout(0) is enough — the synthetic mouse
            // event lands first.
            setTimeout(() => setFocused(false), 0);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? 'Game title...'}
          className={cn(
            'h-[38px] w-full rounded-[7px] border border-apex-line-1 bg-white pl-[34px] pr-[110px] font-sans text-[13px] text-apex-ink outline-none transition-[border-color,box-shadow] placeholder:text-apex-hint focus:border-apex-accent focus:shadow-[0_0_0_3px_rgba(79,110,247,0.1)]',
          )}
        />
        {selectedCandidate && (
          <span className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            MATCHED · IGDB
          </span>
        )}
      </div>

      {showDropdown &&
        anchor &&
        createPortal(
          <div
            className="fixed z-[60] overflow-hidden rounded-[8px] border border-apex-line-1 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
            // pointer-events: auto — Radix Dialog's RemoveScroll sets
            // `pointer-events: none` on <body>, which inherits to our portaled
            // dropdown. Without this override, clicks on suggestions die at the
            // body.
            style={{
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              transform: anchor.placement === 'above' ? 'translateY(-100%)' : undefined,
              pointerEvents: 'auto',
            }}
          >
            <ul
              className="overflow-y-auto overscroll-contain"
              style={{ maxHeight: Math.max(80, anchor.maxHeight - FOOTER_RESERVE) }}
              // Radix Dialog wraps content in react-remove-scroll which
              // preventDefaults wheel/touchmove on everything outside its
              // subtree. Since this dropdown is portaled to <body>, native
              // scroll is killed — drive scrollTop ourselves.
              onWheel={(e) => {
                e.currentTarget.scrollTop += e.deltaY;
              }}
              onTouchStart={(e) => {
                touchStartYRef.current = e.touches[0]?.clientY ?? null;
              }}
              onTouchMove={(e) => {
                const prev = touchStartYRef.current;
                const next = e.touches[0]?.clientY;
                if (prev == null || next == null) return;
                e.currentTarget.scrollTop += prev - next;
                touchStartYRef.current = next;
              }}
              onTouchEnd={() => {
                touchStartYRef.current = null;
              }}
            >
              {candidates.map((c, idx) => {
                const active = idx === highlight;
                return (
                  <li
                    key={`${c.providerName}:${c.providerId}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-3 py-2 text-[12.5px]',
                      active ? 'bg-apex-line-1/60' : 'hover:bg-apex-line-1/40',
                    )}
                    data-active={active ? 'true' : undefined}
                    onMouseDown={(e) => {
                      // Use onMouseDown — onClick would lose to input.onBlur.
                      e.preventDefault();
                      onSelectCandidate(c);
                      setFocused(false);
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <CandidateThumb candidate={c} fallbackColor={fallbackColor} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-apex-ink">
                        <HighlightedTitle text={c.title} match={trimmed} />
                      </div>
                      <div className="truncate text-[11px] text-apex-muted">
                        {[c.developer, c.releaseYear].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-600">
                      IGDB
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-apex-line-1 bg-[#fafafa] px-3 py-1.5 text-[10px] text-apex-hint">
              <span>
                <kbd className="font-sans">↑↓</kbd> navigate · <kbd className="font-sans">↵</kbd>{' '}
                select
              </span>
              <span>{candidates.length} matches</span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function CandidateThumb({
  candidate,
  fallbackColor,
}: {
  candidate: MetadataCandidate;
  fallbackColor: string;
}) {
  if (candidate.coverImageUrl) {
    return (
      <img
        src={candidate.coverImageUrl}
        alt=""
        className="h-9 w-7 flex-shrink-0 rounded-[3px] object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-9 w-7 flex-shrink-0 items-center justify-center rounded-[3px] text-[10px] font-semibold text-white"
      style={{ background: fallbackColor }}
    >
      {initials(candidate.title)}
    </div>
  );
}

function HighlightedTitle({ text, match }: { text: string; match: string }) {
  const segments = useMemo(() => {
    if (!match) return [{ key: 'whole', text, hit: false }];
    const lc = text.toLowerCase();
    const needle = match.toLowerCase();
    const idx = lc.indexOf(needle);
    if (idx === -1) return [{ key: 'whole', text, hit: false }];
    return [
      { key: 'pre', text: text.slice(0, idx), hit: false },
      { key: 'hit', text: text.slice(idx, idx + match.length), hit: true },
      { key: 'post', text: text.slice(idx + match.length), hit: false },
    ];
  }, [text, match]);
  return (
    <>
      {segments.map((s) =>
        s.hit ? (
          <mark key={s.key} className="rounded-sm bg-blue-100 px-[1px] font-bold text-apex-accent">
            {s.text}
          </mark>
        ) : (
          <span key={s.key}>{s.text}</span>
        ),
      )}
    </>
  );
}
