import { type FormEvent, useCallback, useState } from 'react';

/**
 * Field descriptor for `useCredentialsForm`.
 *
 * @property name      - The form-input `name` attribute used as the key in `new FormData(form)` lookups.
 * @property validate  - Optional client-side validator. Return a non-empty string to surface as `fieldErrors[name]`,
 *                       or null/undefined to pass. Runs BEFORE `args.onSubmit` is invoked. Receives the current
 *                       field value plus the full values map (for cross-field invariants like `password === confirmPassword`).
 */
export interface CredentialField {
  name: string;
  validate?: (value: string, all: Record<string, string>) => string | null | undefined;
}

export interface UseCredentialsFormArgs<T extends Record<string, string>> {
  fields: readonly CredentialField[];
  onSubmit: (
    values: T,
  ) => Promise<{ error?: string; fieldErrors?: Partial<Record<keyof T, string>> } | void>;
}

export interface UseCredentialsFormReturn<T> {
  handleSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  isPending: boolean;
  error: string | null;
  fieldErrors: Partial<Record<keyof T, string>>;
  resetErrors: () => void;
}

/**
 * Uncontrolled-form driver for credential pages (login + register).
 *
 * Invariants pinned by FE-06 source-pin convention tests:
 *   1. Form values come from `new FormData(form)` — NEVER from React state (browser autofill rule).
 *      The hook does NOT inject `value=` / `onChange=` props onto inputs; the caller renders bare
 *      `<Input name="..." />`.
 *   2. `e.currentTarget` is captured SYNCHRONOUSLY before any `await` (React synthetic event pooling).
 *   3. The hook is AUTH-AGNOSTIC.
 *
 * Rationale for invariant 3 (auth-agnostic): the better-auth session refetch lives in the
 * caller's `onSubmit` callback, not in this hook. This is a DELIBERATE choice — pulling the
 * refetch into the hook would semantically work, but it would prevent the FE-06 source-pin
 * test from observing the invariant at the page-source layer (grill C3 → enterprise B.5).
 * The MEMORY rule `feedback_better_auth_session_refetch` is about *what the page does
 * after sign-in*, not about the hook's internals — so the pin lives where the invariant
 * lives. If you ever refactor this to call the session refetch inside the hook, you MUST
 * simultaneously rewrite the source-pin tests to inspect the hook source instead (and
 * accept that the pin no longer pins the page semantics).
 */
export function useCredentialsForm<T extends Record<string, string>>(
  args: UseCredentialsFormArgs<T>,
): UseCredentialsFormReturn<T> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof T, string>>>({});

  const resetErrors = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      const form = e.currentTarget; // SYNC capture before any await (RESEARCH §Pitfall 4)
      const data = new FormData(form); // SYNC

      const values = {} as Record<string, string>;
      for (const f of args.fields) {
        values[f.name] = String(data.get(f.name) ?? '').trim();
      }

      const errs: Record<string, string> = {};
      for (const f of args.fields) {
        if (!f.validate) continue;
        const msg = f.validate(values[f.name], values);
        if (msg) errs[f.name] = msg;
      }
      if (Object.keys(errs).length > 0) {
        setError(null); // clear stale banner from previous submission
        setFieldErrors(errs as Partial<Record<keyof T, string>>);
        return;
      }

      resetErrors();
      setIsPending(true);
      const result = await args.onSubmit(values as T);
      setIsPending(false);

      // Always overwrite both — using nullish coalescing so a missing field
      // explicitly clears stale state instead of merging into prior errors.
      setError(result?.error ?? null);
      setFieldErrors(result?.fieldErrors ?? {});
    },
    [args, resetErrors],
  );

  return { handleSubmit, isPending, error, fieldErrors, resetErrors };
}
