import { CoverThumb, MetadataCandidateCard } from '@/components/metadata-candidate-card';
import { Button } from '@/components/ui/button';
import type { useMetadataCandidatesQuery } from '@/lib/queries';
import type { MetadataCandidate } from '@/types';

interface MetadataMatchPickerProps {
  candidatesQuery: ReturnType<typeof useMetadataCandidatesQuery>;
  selectedProviderId: string | null;
  selectedCandidate: MetadataCandidate | null;
  onSelect: (providerId: string) => void;
  onClearSelection: () => void;
  onEditSearch: () => void;
  onContinueWithoutMatch: () => void;
  fallbackColor: string;
  title: string;
}

export function MetadataMatchPicker({
  candidatesQuery,
  selectedProviderId,
  selectedCandidate,
  onSelect,
  onClearSelection,
  onEditSearch,
  onContinueWithoutMatch,
  fallbackColor,
  title,
}: MetadataMatchPickerProps) {
  if (candidatesQuery.isLoading) {
    return <CandidateListSkeleton />;
  }

  const isError = candidatesQuery.isError;
  const data = candidatesQuery.data;
  const degraded = !isError && data ? data.degraded : false;

  if (isError || degraded) {
    return <DegradedBanner onContinue={onContinueWithoutMatch} />;
  }

  if (!data || data.candidates.length === 0) {
    return (
      <EmptyMatches title={title} onContinue={onContinueWithoutMatch} onEditSearch={onEditSearch} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-apex-muted">We found these on IGDB</p>
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
        {data.candidates.map((c) => (
          <MetadataCandidateCard
            key={c.providerId}
            candidate={c}
            selected={c.providerId === selectedProviderId}
            onSelect={() => onSelect(c.providerId)}
            fallbackColor={fallbackColor}
          />
        ))}
      </div>

      {selectedCandidate && (
        <SelectedPreview
          candidate={selectedCandidate}
          fallbackColor={fallbackColor}
          onClear={onClearSelection}
        />
      )}

      <a
        href="https://www.igdb.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-apex-hint hover:underline"
      >
        Powered by IGDB
      </a>
    </div>
  );
}

function CandidateListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[10px] border border-apex-line-1 p-3"
        >
          <div className="h-[86px] w-[64px] animate-pulse rounded-[6px] bg-apex-line-1" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-apex-line-1" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-apex-line-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DegradedBanner({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
        Couldn't reach IGDB. You can still add the game manually.
      </div>
      <div className="flex justify-center">
        <Button variant="primary" size="sm" onClick={onContinue}>
          Continue without match
        </Button>
      </div>
    </div>
  );
}

interface EmptyMatchesProps {
  title: string;
  onContinue: () => void;
  onEditSearch: () => void;
}

function EmptyMatches({ title, onContinue, onEditSearch }: EmptyMatchesProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <p className="text-[14px] text-apex-ink">No IGDB matches for &ldquo;{title}&rdquo;</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="sm" onClick={onContinue}>
          Continue without match
        </Button>
        <Button variant="outline" size="sm" onClick={onEditSearch}>
          Edit search
        </Button>
      </div>
    </div>
  );
}

interface SelectedPreviewProps {
  candidate: MetadataCandidate;
  fallbackColor: string;
  onClear: () => void;
}

function SelectedPreview({ candidate, fallbackColor, onClear }: SelectedPreviewProps) {
  const metaParts: string[] = [];
  if (candidate.releaseYear != null) metaParts.push(String(candidate.releaseYear));
  if (candidate.developer) metaParts.push(candidate.developer);
  const metaLine = metaParts.join(' · ');
  return (
    <div className="mt-1 flex items-center gap-3 rounded-[7px] border border-apex-line-1 p-3">
      <CoverThumb
        src={candidate.coverImageUrl}
        title={candidate.title}
        fallbackColor={fallbackColor}
        size="sm"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-apex-ink">{candidate.title}</span>
        {metaLine && <span className="truncate text-[11px] text-apex-muted">{metaLine}</span>}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 text-[12px] text-apex-accent hover:underline"
      >
        Change
      </button>
    </div>
  );
}
