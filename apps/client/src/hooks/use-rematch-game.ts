import { useEnrichGameMetadataMutation, useMetadataCandidatesQuery } from '@/lib/queries';
import type { Game, MetadataCandidate } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

// UploadThing serves covers from two host families (verified in
// apps/api/src/application/cover-storage/cleanup-orphans.test.ts:58):
//   - utfs.io (exact)
//   - *.ufs.sh (subdomain wildcard, e.g. xxxx.ufs.sh)
function isUploadThingHost(host: string): boolean {
  return host === 'utfs.io' || host.endsWith('.ufs.sh');
}

const IGDB_IMAGE_HOST = 'images.igdb.com';

function parseHostOrNull(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export interface UseRematchGameResult {
  open: boolean;
  setOpen: (v: boolean) => void;
  selectedProviderId: string | null;
  setSelectedProviderId: (v: string | null) => void;
  selectedCandidate: MetadataCandidate | null;
  candidatesQuery: ReturnType<typeof useMetadataCandidatesQuery>;
  mutation: ReturnType<typeof useEnrichGameMetadataMutation>;
  pendingReplace: { candidate: MetadataCandidate } | null;
  setPendingReplace: (v: { candidate: MetadataCandidate } | null) => void;
  onConfirmClick: () => void;
  confirm: (opts?: { keepCover?: boolean }) => Promise<void>;
}

export function useRematchGame(game: Game): UseRematchGameResult {
  const [open, setOpen] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [pendingReplace, setPendingReplace] = useState<{ candidate: MetadataCandidate } | null>(
    null,
  );

  const candidatesQuery = useMetadataCandidatesQuery(game.title, game.platform, open);
  const mutation = useEnrichGameMetadataMutation(game.id);
  const queryClient = useQueryClient();

  const selectedCandidate: MetadataCandidate | null =
    candidatesQuery.data?.candidates.find((c) => c.providerId === selectedProviderId) ?? null;

  const needsReplaceConfirm = (candidate: MetadataCandidate): boolean => {
    if (!game.coverImage || !candidate.coverImageUrl) return false;
    const currentHost = parseHostOrNull(game.coverImage);
    const newHost = parseHostOrNull(candidate.coverImageUrl);
    if (currentHost === null || newHost === null) return false;
    return isUploadThingHost(currentHost) && newHost === IGDB_IMAGE_HOST;
  };

  const confirm = async (opts: { keepCover?: boolean } = {}): Promise<void> => {
    const candidate = selectedCandidate ?? pendingReplace?.candidate ?? null;
    if (!candidate) return;
    await mutation.mutateAsync({
      providerName: 'igdb',
      providerId: candidate.providerId,
      snapshot: {
        coverImageUrl: opts.keepCover ? null : candidate.coverImageUrl,
        releaseYear: candidate.releaseYear,
        developer: candidate.developer,
      },
    });
    setOpen(false);
    setSelectedProviderId(null);
    setPendingReplace(null);
    queryClient.invalidateQueries({ queryKey: ['metadata-candidates'] });
  };

  const onConfirmClick = (): void => {
    if (!selectedCandidate) return;
    if (needsReplaceConfirm(selectedCandidate)) {
      setPendingReplace({ candidate: selectedCandidate });
    } else {
      void confirm();
    }
  };

  return {
    open,
    setOpen,
    selectedProviderId,
    setSelectedProviderId,
    selectedCandidate,
    candidatesQuery,
    mutation,
    pendingReplace,
    setPendingReplace,
    onConfirmClick,
    confirm,
  };
}
