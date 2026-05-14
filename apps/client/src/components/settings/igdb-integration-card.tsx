import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useClearIgdbIntegrationMutation,
  useIgdbIntegrationQuery,
  useSaveIgdbIntegrationMutation,
} from '@/hooks/use-igdb-integration';
import { ApiError, type IgdbIntegrationStatusResponse } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SettingsInlineToggle } from './settings-inline-toggle';

const IGDB_DOCS_URL = 'https://api-docs.igdb.com/';
const TOGGLE_DISABLED_TOOLTIP = 'Zapisz dane API, aby aktywować';

type FieldErrors = {
  clientId?: string;
  clientSecret?: string;
};

type FormError = {
  fieldErrors: FieldErrors;
  banner: string | null;
};

/**
 * Maps a thrown `ApiError` from `saveIgdbIntegration` to inline form errors.
 * Spec from Phase 6 plan — keep the `type` strings in sync with the API
 * router's `saveErrorToHttp`.
 */
function mapSaveError(error: unknown): FormError {
  if (!(error instanceof ApiError)) {
    return {
      fieldErrors: {},
      banner: 'Coś poszło nie tak. Spróbuj ponownie.',
    };
  }
  const body = (error.body ?? {}) as { type?: unknown; reason?: unknown };
  const type = typeof body.type === 'string' ? body.type : '';
  const reason = typeof body.reason === 'string' ? body.reason : '';

  if (type === '/errors/invalid-credentials') {
    if (reason === 'client_id') {
      return {
        fieldErrors: { clientId: 'Twitch nie rozpoznał tego Client ID.' },
        banner: null,
      };
    }
    if (reason === 'client_secret') {
      return {
        fieldErrors: { clientSecret: 'Twitch odrzucił Client secret.' },
        banner: null,
      };
    }
    return {
      fieldErrors: { clientSecret: 'Twitch odrzucił dane logowania.' },
      banner: null,
    };
  }
  if (type === '/errors/twitch-unavailable') {
    return {
      fieldErrors: {},
      banner: 'IGDB jest chwilowo niedostępne. Spróbuj ponownie za chwilę.',
    };
  }
  if (type === '/errors/twitch-timeout') {
    return {
      fieldErrors: {},
      banner: 'Nie udało się skontaktować z IGDB. Sprawdź połączenie i spróbuj ponownie.',
    };
  }
  if (type === '/errors/storage-corrupt') {
    return {
      fieldErrors: {},
      banner: 'Zapisane dane uwierzytelniające są uszkodzone. Wpisz Client secret ponownie.',
    };
  }
  if (type === '/errors/invalid-input') {
    const issues = (body as { issues?: unknown }).issues;
    if (Array.isArray(issues)) {
      const fieldErrors: FieldErrors = {};
      for (const raw of issues) {
        if (!raw || typeof raw !== 'object') continue;
        const issue = raw as { path?: unknown; message?: unknown };
        const message = typeof issue.message === 'string' ? issue.message : '';
        if (!Array.isArray(issue.path)) continue;
        const head = issue.path[0];
        if (head === 'clientId' && !fieldErrors.clientId) fieldErrors.clientId = message;
        if (head === 'clientSecret' && !fieldErrors.clientSecret)
          fieldErrors.clientSecret = message;
      }
      if (fieldErrors.clientId || fieldErrors.clientSecret) {
        return { fieldErrors, banner: null };
      }
    }
    return {
      fieldErrors: {},
      banner: 'Dane wejściowe są nieprawidłowe.',
    };
  }
  return {
    fieldErrors: {},
    banner: error.message || 'Coś poszło nie tak. Spróbuj ponownie.',
  };
}

export function IgdbIntegrationCard() {
  const { data, isLoading } = useIgdbIntegrationQuery();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const formApiRef = useRef<IgdbIntegrationFormHandle | null>(null);

  const onToggleClick = () => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    const api = formApiRef.current;
    if (api) {
      api.requestClose();
    } else {
      setExpanded(false);
    }
  };

  const connected = data?.status === 'configured' && data.enabled && data.lastVerifiedAt !== null;

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-4 rounded-[10px] border border-apex-line-4 bg-white px-4 py-3.5">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-[8px] bg-apex-surface-hover" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-32 animate-pulse rounded bg-apex-surface-hover" />
          <div className="h-3 w-56 animate-pulse rounded bg-apex-surface-hover" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-apex-line-4 bg-white">
      <div className="flex items-start gap-4 px-4 py-3.5">
        <div className="relative shrink-0">
          <IgdbMark />
          {connected && (
            <span
              aria-label="Połączono"
              className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white"
            >
              <svg viewBox="0 0 8 8" className="h-2 w-2" aria-hidden="true">
                <path
                  d="M1 4.2L3 6l4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-semibold text-apex-ink">IGDB</span>
            <span className="text-[12px] text-apex-muted">Internet Game Database</span>
            {connected && (
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                Connected
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-apex-ink-6">
            Auto-uzupełnianie metadanych, okładek i dat premier z największej otwartej bazy gier.
          </p>
        </div>
        <div className="shrink-0 self-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={onToggleClick}
            className="h-8 border-apex-line-1 bg-white px-3 text-[12.5px] text-apex-ink hover:bg-apex-line-4 hover:text-apex-ink"
          >
            {expanded ? 'Ukryj' : 'Konfiguruj'}
          </Button>
        </div>
      </div>
      <SettingsInlineToggle open={expanded} id={bodyId}>
        {data && (
          <IgdbIntegrationForm
            key={data.updatedAt ?? 'fresh'}
            ref={formApiRef}
            data={data}
            onRequestClose={() => setExpanded(false)}
          />
        )}
      </SettingsInlineToggle>
    </div>
  );
}

type IgdbIntegrationFormProps = {
  data: IgdbIntegrationStatusResponse;
  onRequestClose: () => void;
};

export type IgdbIntegrationFormHandle = {
  requestClose: () => void;
};

/**
 * Inline form for the IGDB integration. Inputs are UNCONTROLLED — submission
 * reads them via `FormData`, browser autofill works (project memory:
 * `feedback_react_autofill_uncontrolled`). Local React state only tracks
 * dirtiness, the toggle, and editing mode for the masked client id.
 *
 * The parent remounts this form via `key={data.updatedAt}` whenever the
 * server payload changes, so we don't need a dedicated re-sync effect.
 */
const IgdbIntegrationForm = forwardRef<IgdbIntegrationFormHandle, IgdbIntegrationFormProps>(
  function IgdbIntegrationForm({ data, onRequestClose }, ref) {
    const qc = useQueryClient();
    const mutation = useSaveIgdbIntegrationMutation();
    const clearMutation = useClearIgdbIntegrationMutation();

    const initialClientId = data.clientId ?? '';
    const hasStoredClientId = initialClientId.length > 0;
    const hasStoredSecret = data.hasSecret;
    const clientIdMasked = data.clientIdMasked ?? '';
    const isConfigured = data.status === 'configured';

    const clientIdInputId = useId();
    const clientSecretInputId = useId();
    const toggleLabelId = useId();
    const toggleDescId = useId();

    const formRef = useRef<HTMLFormElement>(null);
    const clientIdInputRef = useRef<HTMLInputElement>(null);

    const [formDirty, setFormDirty] = useState(false);
    // `clientIdEditing` flips on when the user explicitly clicks "Edit" on the
    // masked display OR when there is no stored client id at all.
    const [clientIdEditing, setClientIdEditing] = useState(!hasStoredClientId);
    const [clientIdHasValue, setClientIdHasValue] = useState(hasStoredClientId);
    const [secretHasValue, setSecretHasValue] = useState(false);
    const [pendingEnabled, setPendingEnabled] = useState(data.enabled);
    const [submitError, setSubmitError] = useState<FormError | null>(null);
    const [disconnectOpen, setDisconnectOpen] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);

    useEffect(() => {
      if (clientIdEditing && clientIdInputRef.current) {
        clientIdInputRef.current.focus();
      }
    }, [clientIdEditing]);

    const toggleDisabled = !hasStoredSecret;

    const saveDisabled =
      !formDirty ||
      mutation.isPending ||
      !clientIdHasValue ||
      (!hasStoredSecret && !secretHasValue);

    const cancelDisabled = !formDirty || mutation.isPending;

    const resetForm = () => {
      formRef.current?.reset();
      setFormDirty(false);
      setSecretHasValue(false);
      setClientIdEditing(!hasStoredClientId);
      setClientIdHasValue(hasStoredClientId);
      setPendingEnabled(data.enabled);
      setSubmitError(null);
    };

    const onCancel = async () => {
      resetForm();
      await qc.invalidateQueries({ queryKey: ['integrations', 'igdb'] });
    };

    useImperativeHandle(
      ref,
      () => ({
        requestClose: () => {
          if (formDirty) {
            setDiscardOpen(true);
            return;
          }
          onRequestClose();
        },
      }),
      [formDirty, onRequestClose],
    );

    const onConfirmDiscard = () => {
      resetForm();
      setDiscardOpen(false);
      onRequestClose();
    };

    const onConfirmDisconnect = () => {
      if (clearMutation.isPending) return;
      clearMutation.mutate(crypto.randomUUID(), {
        onSuccess: () => {
          toast.success('Rozłączono.');
          setDisconnectOpen(false);
          onRequestClose();
        },
      });
    };

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (mutation.isPending) return;
      const fd = new FormData(e.currentTarget);
      const rawSecret = String(fd.get('clientSecret') ?? '');
      const rawClientIdEdit = String(fd.get('clientId') ?? '').trim();

      const clientId = clientIdEditing ? rawClientIdEdit : initialClientId;

      if (clientId.length === 0) {
        setSubmitError({
          fieldErrors: { clientId: 'Wpisz Client ID.' },
          banner: null,
        });
        return;
      }

      const clientSecret = rawSecret.length === 0 && hasStoredSecret ? null : rawSecret;

      if (clientSecret !== null && clientSecret.length === 0) {
        setSubmitError({
          fieldErrors: { clientSecret: 'Wpisz Client secret.' },
          banner: null,
        });
        return;
      }

      const idempotencyKey = crypto.randomUUID();
      setSubmitError(null);

      try {
        await mutation.mutateAsync({
          clientId,
          clientSecret,
          enabled: pendingEnabled,
          idempotencyKey,
        });
        toast.success('Zapisano. IGDB połączone.');
        // Parent remounts the form on `data.updatedAt` change → fresh state.
      } catch (err) {
        setSubmitError(mapSaveError(err));
      }
    };

    const onClientIdEditClick = () => {
      setClientIdEditing(true);
      setClientIdHasValue(false);
      setFormDirty(true);
    };

    const onClientIdInput = (e: React.FormEvent<HTMLInputElement>) => {
      setClientIdHasValue(e.currentTarget.value.length > 0);
      setFormDirty(true);
    };

    const onSecretInput = (e: React.FormEvent<HTMLInputElement>) => {
      setSecretHasValue(e.currentTarget.value.length > 0);
      setFormDirty(true);
    };

    const onToggleChange = (next: boolean) => {
      setPendingEnabled(next);
      setFormDirty(true);
    };

    const secretPlaceholder = hasStoredSecret ? '•'.repeat(20) : 'Wprowadź Client secret';
    const clientIdInvalid = submitError?.fieldErrors.clientId !== undefined;
    const clientSecretInvalid = submitError?.fieldErrors.clientSecret !== undefined;

    return (
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        className="space-y-3 border-t border-apex-line-4 bg-apex-surface-head px-4 pb-4 pt-4"
      >
        {submitError?.banner && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800"
          >
            {submitError.banner}
          </div>
        )}

        {clearMutation.isError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800"
          >
            Nie udało się rozłączyć. Spróbuj ponownie.
          </div>
        )}

        <div className="flex items-start justify-between gap-4 rounded-[8px] border border-apex-line-4 bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <div id={toggleLabelId} className="text-[13px] font-semibold text-apex-ink">
              {pendingEnabled ? 'Integracja włączona' : 'Integracja wyłączona'}
            </div>
            <div id={toggleDescId} className="mt-0.5 text-[12px] text-apex-muted">
              Apex zapyta IGDB przy dodawaniu lub synchronizacji gier.
            </div>
          </div>
          {toggleDisabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-disabled="true"
                  aria-labelledby={toggleLabelId}
                  aria-describedby={toggleDescId}
                  onClick={(e) => e.preventDefault()}
                  className="inline-flex cursor-not-allowed items-center"
                >
                  <Switch checked={pendingEnabled} disabled tabIndex={-1} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{TOGGLE_DISABLED_TOOLTIP}</TooltipContent>
            </Tooltip>
          ) : (
            <Switch
              checked={pendingEnabled}
              onCheckedChange={onToggleChange}
              aria-labelledby={toggleLabelId}
              aria-describedby={toggleDescId}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={clientIdInputId} className="text-[12px] font-semibold text-apex-ink">
            Client ID
          </Label>
          {clientIdEditing ? (
            <Input
              ref={clientIdInputRef}
              id={clientIdInputId}
              name="clientId"
              type="text"
              autoComplete="off"
              spellCheck={false}
              defaultValue=""
              onInput={onClientIdInput}
              aria-invalid={clientIdInvalid ? true : undefined}
              aria-describedby={clientIdInvalid ? `${clientIdInputId}-error` : undefined}
              className={cn(
                'h-9 font-mono text-[13px]',
                clientIdInvalid && 'border-red-400 focus:border-red-400',
              )}
            />
          ) : (
            <button
              type="button"
              onClick={onClientIdEditClick}
              className={cn(
                'flex h-9 w-full items-center justify-between rounded-[7px] border border-apex-line-1 bg-white px-[11px] text-left font-mono text-[13px] text-apex-ink transition-colors hover:border-apex-accent/60',
                clientIdInvalid && 'border-red-400',
              )}
            >
              <span className="truncate">{clientIdMasked}</span>
              <span className="ml-3 text-[11px] font-sans font-medium text-apex-accent">Zmień</span>
            </button>
          )}
          {clientIdInvalid && (
            <p id={`${clientIdInputId}-error`} className="text-[12px] text-red-700">
              {submitError?.fieldErrors.clientId}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={clientSecretInputId} className="text-[12px] font-semibold text-apex-ink">
            Client secret
          </Label>
          <Input
            id={clientSecretInputId}
            name="clientSecret"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={secretPlaceholder}
            onInput={onSecretInput}
            aria-invalid={clientSecretInvalid ? true : undefined}
            aria-describedby={clientSecretInvalid ? `${clientSecretInputId}-error` : undefined}
            className={cn(
              'h-9 font-mono text-[13px]',
              clientSecretInvalid && 'border-red-400 focus:border-red-400',
            )}
          />
          {clientSecretInvalid ? (
            <p id={`${clientSecretInputId}-error`} className="text-[12px] text-red-700">
              {submitError?.fieldErrors.clientSecret}
            </p>
          ) : (
            hasStoredSecret && (
              <p className="text-[12px] text-apex-muted">
                Sekret jest zapisany. Pozostaw puste, aby go nie zmieniać.
              </p>
            )
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <a
            href={IGDB_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-apex-accent hover:underline"
          >
            Dokumentacja API ↗
          </a>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onCancel()}
              disabled={cancelDisabled}
              className="h-8 border-apex-line-1 bg-white px-4 text-[12.5px] text-apex-ink hover:bg-apex-line-4 hover:text-apex-ink"
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={saveDisabled}
              className="h-8 px-4 text-[12.5px]"
            >
              {mutation.isPending ? 'Zapisywanie…' : 'Zapisz zmiany'}
            </Button>
          </div>
        </div>

        {isConfigured && (
          <div className="flex border-t border-apex-line-4 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDisconnectOpen(true)}
              disabled={clearMutation.isPending}
              className="h-8 px-2 text-[12.5px] text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {clearMutation.isPending ? 'Rozłączanie…' : 'Rozłącz'}
            </Button>
          </div>
        )}

        <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rozłączyć IGDB?</AlertDialogTitle>
              <AlertDialogDescription>
                Usuniemy zapisane dane uwierzytelniające. Aby ponownie korzystać z autouzupełniania,
                podaj je jeszcze raz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearMutation.isPending}>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                disabled={clearMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  onConfirmDisconnect();
                }}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {clearMutation.isPending ? 'Rozłączanie…' : 'Rozłącz'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Odrzucić zmiany?</AlertDialogTitle>
              <AlertDialogDescription>
                Wprowadzone dane nie zostaną zapisane.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Wróć do edycji</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  onConfirmDiscard();
                }}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Odrzuć
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
    );
  },
);

function IgdbMark() {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[11px] font-bold tracking-wide text-white"
      style={{ background: 'linear-gradient(135deg, #6f3ff5, #a87bff)' }}
    >
      IG
    </div>
  );
}
