import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-pin convention test (NOT behavioral). See LoginPage rationale.
 */
describe('RegisterPage source-pin convention — FE-06', () => {
  const source = readFileSync(resolve(__dirname, '../register.tsx'), 'utf-8');

  test('imports useCredentialsForm hook (FE-02 dedup)', () => {
    expect(source).toMatch(/from '@\/hooks\/use-credentials-form'/);
    expect(source).toMatch(/useCredentialsForm/);
  });

  test('imports signUp from @/lib/auth-client', () => {
    expect(source).toMatch(/from '@\/lib\/auth-client'/);
    expect(source).toMatch(/signUp\.email/);
  });

  test('refetchSession is awaited BEFORE navigate (MEMORY: feedback_better_auth_session_refetch)', () => {
    const refetchIdx = source.search(/await\s+refetchSession\s*\(\s*\)/);
    const navigateIdx = source.search(/navigate\s*\(/);
    expect(refetchIdx).toBeGreaterThan(-1);
    expect(navigateIdx).toBeGreaterThan(-1);
    expect(refetchIdx).toBeLessThan(navigateIdx);
  });

  test('form uses uncontrolled inputs (FormData driver) — MEMORY: feedback_react_autofill_uncontrolled', () => {
    expect(source).toMatch(/<Input[^>]*name="name"/);
    expect(source).toMatch(/<Input[^>]*name="email"/);
    expect(source).toMatch(/<Input[^>]*name="password"/);
    expect(source).toMatch(/<Input[^>]*name="confirmPassword"/);
  });

  test('no controlled-input value= prop on credential inputs', () => {
    expect(source).not.toMatch(/<Input[^>]*name="email"[^>]*value=\{/);
    expect(source).not.toMatch(/<Input[^>]*name="password"[^>]*value=\{/);
    expect(source).not.toMatch(/<Input[^>]*name="confirmPassword"[^>]*value=\{/);
    expect(source).not.toMatch(/<Input[^>]*name="name"[^>]*value=\{/);
  });
});
