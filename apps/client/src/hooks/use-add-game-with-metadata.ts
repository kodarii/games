import { COVER_COLORS } from '@/lib/avatar';
import { useCreateGameMutation, useMetadataCandidatesQuery } from '@/lib/queries';
import type { MetadataCandidate } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

export type AddGameStep = 1 | 2;

type CreateMutationVars = Parameters<ReturnType<typeof useCreateGameMutation>['mutate']>[0];

export interface UseAddGameWithMetadataResult {
  step: AddGameStep;
  title: string;
  setTitle: (v: string) => void;
  platform: string;
  setPlatform: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  selectedProviderId: string | null;
  setSelectedProviderId: (v: string | null) => void;
  selectedCandidate: MetadataCandidate | null;
  candidatesQuery: ReturnType<typeof useMetadataCandidatesQuery>;
  createMutation: ReturnType<typeof useCreateGameMutation>;
  goStep2: () => void;
  goStep1: () => void;
  submit: (opts: {
    withMatch: boolean;
    onSuccess: (game: { id: string }) => void;
  }) => void;
  reset: () => void;
}

export function useAddGameWithMetadata(initialPlatform: string): UseAddGameWithMetadataResult {
  const [step, setStep] = useState<AddGameStep>(1);
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState(initialPlatform);
  const [color, setColor] = useState<string>(COVER_COLORS[0]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  const candidatesQuery = useMetadataCandidatesQuery(title, platform, step === 2);
  const createMutation = useCreateGameMutation();
  const queryClient = useQueryClient();

  const selectedCandidate: MetadataCandidate | null =
    candidatesQuery.data?.candidates.find((c) => c.providerId === selectedProviderId) ?? null;

  const goStep2 = () => setStep(2);
  const goStep1 = () => {
    setStep(1);
    setSelectedProviderId(null);
  };

  const submit = (opts: {
    withMatch: boolean;
    onSuccess: (game: { id: string }) => void;
  }) => {
    const base = {
      title: title.trim(),
      platform,
      status: 'Backlog' as const,
      format: 'physical' as const,
      coverColor: color,
    };
    const payload: CreateMutationVars =
      opts.withMatch && selectedCandidate
        ? {
            ...base,
            coverImage: selectedCandidate.coverImageUrl ?? undefined,
            releaseYear: selectedCandidate.releaseYear ?? undefined,
            developer: selectedCandidate.developer ?? undefined,
            metadataRef: {
              providerName: 'igdb',
              providerId: selectedCandidate.providerId,
            },
          }
        : base;
    // Mutation errors propagate via createMutation.error and are rendered in
    // the dialog body — onError is intentionally omitted here.
    createMutation.mutate(payload, { onSuccess: opts.onSuccess });
  };

  const createMutationReset = createMutation.reset;
  const reset = useCallback(() => {
    setStep(1);
    setTitle('');
    setPlatform(initialPlatform);
    setColor(COVER_COLORS[0]);
    setSelectedProviderId(null);
    createMutationReset();
    queryClient.invalidateQueries({ queryKey: ['metadata-candidates'] });
  }, [initialPlatform, createMutationReset, queryClient]);

  return {
    step,
    title,
    setTitle,
    platform,
    setPlatform,
    color,
    setColor,
    selectedProviderId,
    setSelectedProviderId,
    selectedCandidate,
    candidatesQuery,
    createMutation,
    goStep2,
    goStep1,
    submit,
    reset,
  };
}
