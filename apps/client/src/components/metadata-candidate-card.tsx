import { cn } from '@/lib/utils';
import type { MetadataCandidate } from '@/types';
import { useState } from 'react';

interface MetadataCandidateCardProps {
  candidate: MetadataCandidate;
  selected: boolean;
  onSelect: () => void;
  fallbackColor: string;
}

export function MetadataCandidateCard({
  candidate,
  selected,
  onSelect,
  fallbackColor,
}: MetadataCandidateCardProps) {
  const visibleBadges = candidate.platformNames.slice(0, 3);
  const extraBadgeCount = candidate.platformNames.length - visibleBadges.length;

  const metaParts: string[] = [];
  if (candidate.releaseYear != null) metaParts.push(String(candidate.releaseYear));
  if (candidate.developer) metaParts.push(candidate.developer);
  const metaLine = metaParts.join(' · ');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-[10px] border p-3 text-left transition-colors',
        selected
          ? 'border-2 border-apex-accent bg-apex-accent/5'
          : 'border border-apex-line-1 hover:bg-apex-line-1/30',
      )}
    >
      <CoverThumb
        src={candidate.coverImageUrl}
        title={candidate.title}
        fallbackColor={fallbackColor}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[14px] font-semibold text-apex-ink">{candidate.title}</span>
        {metaLine && <span className="truncate text-[12px] text-apex-muted">{metaLine}</span>}
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {visibleBadges.map((p) => (
            <span
              key={p}
              className="rounded bg-apex-line-1 px-1.5 py-0.5 text-[10px] text-apex-hint"
            >
              {p}
            </span>
          ))}
          {extraBadgeCount > 0 && (
            <span className="rounded bg-apex-line-1 px-1.5 py-0.5 text-[10px] text-apex-hint">
              +{extraBadgeCount}
            </span>
          )}
        </div>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium',
          selected ? 'bg-apex-accent text-white' : 'border border-apex-line-1 text-apex-muted',
        )}
      >
        {selected ? 'Selected' : 'Use'}
      </span>
    </button>
  );
}

interface CoverThumbProps {
  src: string | null;
  title: string;
  fallbackColor: string;
  size?: 'sm' | 'md';
}

export function CoverThumb({ src, title, fallbackColor, size = 'md' }: CoverThumbProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const dims = size === 'sm' ? 'h-[54px] w-[40px]' : 'h-[86px] w-[64px]';
  const showImage = src != null && !imgFailed;
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-[6px]',
        dims,
      )}
      style={showImage ? undefined : { backgroundColor: fallbackColor }}
    >
      {showImage ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white/90">
          {title.slice(0, 2)}
        </span>
      )}
    </div>
  );
}
