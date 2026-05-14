import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { user as authUser } from '../../db/auth-schema';
import { db } from '../../db/client';
import { auth } from '../auth';

const EMAIL = `cookie-test-${crypto.randomUUID()}@example.test`;
const PASSWORD = 'test-password-12345';

describe('session cookie has SameSite=Strict', () => {
  beforeAll(async () => {
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: 'Cookie Test' },
    });
  });

  afterAll(async () => {
    await db.delete(authUser).where(eq(authUser.email, EMAIL));
  });

  it('Set-Cookie on /sign-in/email contains SameSite=Strict', async () => {
    const res = await auth.handler(
      new Request('http://localhost:3001/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const sessionCookie = cookies.find((c) => /session/i.test(c)) ?? cookies[0];
    expect(sessionCookie.toLowerCase()).toContain('samesite=strict');
  });
});
