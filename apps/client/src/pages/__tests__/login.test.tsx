import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-pin convention test (NOT behavioral).
 * Fails when the file no longer contains the required tokens — does NOT verify
 * runtime behavior. Pins two MEMORY-derived invariants in source form:
 *   - feedback_better_auth_session_refetch: `await refetchSession()` must appear before `navigate(`
 *   - feedback_react_autofill_uncontrolled: credential inputs must be uncontrolled (no `value={...}` prop)
 * Manual UAT (DevTools Network panel: sign-in → get-session → redirect) is the
 * behavioral source of truth. See grill C3 + enterprise F.1 for rationale.
 */
describe('LoginPage source-pin convention — FE-06', () => {
  const source = readFileSync(resolve(__dirname, '../login.tsx'), 'utf-8');

  test('imports useCredentialsForm hook (FE-02 dedup)', () => {
    expect(source).toMatch(/from '@\/hooks\/use-credentials-form'/);
    expect(source).toMatch(/useCredentialsForm/);
  });

  test('imports signIn from @/lib/auth-client (better-auth integration intact)', () => {
    expect(source).toMatch(/from '@\/lib\/auth-client'/);
    expect(source).toMatch(/signIn\.email/);
  });

  test('refetchSession is awaited BEFORE navigate (MEMORY: feedback_better_auth_session_refetch)', () => {
    const refetchIdx = source.search(/await\s+refetchSession\s*\(\s*\)/);
    const navigateIdx = source.search(/navigate\s*\(/);
    expect(refetchIdx).toBeGreaterThan(-1);
    expect(navigateIdx).toBeGreaterThan(-1);
    expect(refetchIdx).toBeLessThan(navigateIdx);
  });

  test('form uses uncontrolled inputs — bare <Input name="..."> (MEMORY: feedback_react_autofill_uncontrolled)', () => {
    expect(source).toMatch(/<Input[^>]*name="email"/);
    expect(source).toMatch(/<Input[^>]*name="password"/);
  });

  test('no controlled-input value= prop on email/password inputs (autofill must work)', () => {
    // The strongest signal: no `value={...}` attribute on the credential inputs.
    expect(source).not.toMatch(/<Input[^>]*name="email"[^>]*value=\{/);
    expect(source).not.toMatch(/<Input[^>]*name="password"[^>]*value=\{/);
  });
});
