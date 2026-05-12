import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ProtectedRoute regression — SET-05', () => {
  const source = readFileSync(resolve(__dirname, 'protected-route.tsx'), 'utf-8');

  test('imports useSession from @/lib/auth-client', () => {
    expect(source).toMatch(/from '@\/lib\/auth-client'/);
    expect(source).toMatch(/useSession/);
  });

  test('redirects unauthenticated users to /login', () => {
    expect(source).toMatch(/<Navigate[^>]*to="\/login"/);
    expect(source).toMatch(/replace/);
  });

  test('imports Navigate from react-router-dom', () => {
    expect(source).toMatch(/from 'react-router-dom'/);
    expect(source).toMatch(/Navigate/);
  });
});
