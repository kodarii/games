# IGDB integration tile — Phase 3: Twitch credentials verifier

## Goal
Add a port `IgdbCredentialsVerifier` that takes a `clientId` + `clientSecret`
and tells the caller whether Twitch accepts them. Implement it against the
real Twitch OAuth2 token endpoint with a strict timeout. The use-case in
the next phase will call this BEFORE writing credentials to the DB.

## Definition of Done
- [ ] Verifier tests pass: `bun --filter @apex/api test apps/api/src/infrastructure/integrations/__tests__/twitch-igdb-credentials-verifier.test.ts`
- [ ] All previous tests still pass: `bun --filter @apex/api test`
- [ ] `bun --filter @apex/api run typecheck` + `bun --filter @apex/api run lint` clean

## Context
**Runtime:** Bun. `bun --filter @apex/api ...`.
**HTTP:** Use the global `fetch` available in Bun. No `node-fetch`, no `undici` direct import.
**Twitch OAuth2 token endpoint:**
```
POST https://id.twitch.tv/oauth2/token
  Content-Type: application/x-www-form-urlencoded
  body: client_id=<id>&client_secret=<secret>&grant_type=client_credentials
```
- 200 → `{ access_token, expires_in, token_type }` — credentials are valid.
- 400 with `{ message: 'invalid client' }` → bad client_id.
- 403 with `{ message: 'invalid client secret' }` → bad client_secret.
- 401 / other 4xx → treat as `invalid_credentials` (generic).
- 5xx → `twitch_unavailable`.
- Network error / abort / timeout → `network_unreachable`.

## Design decisions
- The port lives in `domain/integrations/igdb-credentials-verifier.ts` and
  is framework-free. It takes raw plaintext credentials at the boundary
  (the use-case decrypts before calling).
- Signature:
  ```ts
  export type VerifyError =
    | { kind: 'invalid_credentials'; reason: 'client_id' | 'client_secret' | 'unknown' }
    | { kind: 'twitch_unavailable'; status: number }
    | { kind: 'network_unreachable'; reason: 'timeout' | 'fetch_failed' };

  export interface IgdbCredentialsVerifier {
    verify(input: { clientId: string; clientSecret: string }): Promise<Result<void, VerifyError>>;
  }
  ```
- Timeout: 5000 ms (reuse `env.IGDB_TIMEOUT_MS`). Use `AbortSignal.timeout(...)`.
- The impl does NOT cache the token. It does not return the token at all —
  it only answers "valid or not". Token storage stays in `IgdbTokenStore`
  (separate concern, lives in the chain).
- The impl is constructed with `{ fetch: typeof fetch; timeoutMs: number; logger: Logger }`
  so tests can inject a fake `fetch` (no real HTTP from `bun test`).

## Relevant files (edit only these)
- `apps/api/src/domain/integrations/igdb-credentials-verifier.ts` — port + error types
- `apps/api/src/infrastructure/integrations/twitch-igdb-credentials-verifier.ts` — impl
- `apps/api/src/infrastructure/integrations/__tests__/twitch-igdb-credentials-verifier.test.ts` — tests

## Files to read but NOT edit
- `apps/api/src/domain/shared/result.ts` — `Result`, `ok`, `err`
- `apps/api/src/infrastructure/igdb/igdb-token-store.ts` — reference for how the existing chain calls the Twitch token endpoint (DO NOT reuse — the verifier is intentionally separate; it doesn't share state with the token store)
- `apps/api/src/infrastructure/igdb/igdb-http-client.ts` — reference for AbortSignal pattern
- `apps/api/src/infrastructure/logging/logger.ts` — `Logger` interface, `event(name, payload)` method

## Constraints
- TDD: write tests FIRST (RED), then implement.
- Tests MUST NOT hit the real network. Inject a fake `fetch` that returns
  pre-built `Response` objects.
- `verify` returns `Result<void, VerifyError>` — never throws (except for
  programmer errors). Network failures become `err({ kind: 'network_unreachable', ... })`.
- The impl logs three events for telemetry:
  - `integration.igdb.verify.success` (no payload beyond what the logger adds)
  - `integration.igdb.verify.invalid` (with the reason discriminator)
  - `integration.igdb.verify.unavailable` (with the http status or `'timeout'`)
  Do NOT log the clientId or secret in these events.
- DO NOT URL-encode the body manually. Use `new URLSearchParams({...}).toString()`
  and `Content-Type: application/x-www-form-urlencoded`.

## Steps

### Step 1: Port + failing tests (RED)
**Files:**
- `apps/api/src/domain/integrations/igdb-credentials-verifier.ts`
- `apps/api/src/infrastructure/integrations/__tests__/twitch-igdb-credentials-verifier.test.ts`

Define `VerifyError` + `IgdbCredentialsVerifier` exactly as in "Design decisions".

In the test file, build a fake-fetch helper:
```ts
function makeFakeFetch(responses: Array<Response | (() => Promise<Response>) | Error>): typeof fetch {
  let i = 0;
  return (async (_input, _init) => {
    const r = responses[i++];
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r();
    return r!;
  }) as typeof fetch;
}
```
Use a noop logger (`{ event: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => sameLogger }`).

Write these `it()` cases (failing until impl exists):
- `200 with valid token body → ok`
- `400 with body containing "invalid client" → err({ kind: 'invalid_credentials', reason: 'client_id' })`
- `403 with body containing "invalid client secret" → err({ kind: 'invalid_credentials', reason: 'client_secret' })`
- `401 → err({ kind: 'invalid_credentials', reason: 'unknown' })`
- `500 → err({ kind: 'twitch_unavailable', status: 500 })`
- `fake fetch throws AbortError → err({ kind: 'network_unreachable', reason: 'timeout' })`
- `fake fetch throws generic Error → err({ kind: 'network_unreachable', reason: 'fetch_failed' })`
- `request body has client_id, client_secret, grant_type=client_credentials in URL-encoded form` — capture the `init.body` of the fake fetch and assert
- `request URL is https://id.twitch.tv/oauth2/token` — capture the `input` arg
- `Content-Type is application/x-www-form-urlencoded` — capture `init.headers`

Run tests → RED.

### Step 2: Implementation (GREEN)
**File:** `apps/api/src/infrastructure/integrations/twitch-igdb-credentials-verifier.ts`

```ts
export interface TwitchIgdbCredentialsVerifierOptions {
  fetch: typeof fetch;
  timeoutMs: number;
  logger: Logger;
}

export class TwitchIgdbCredentialsVerifier implements IgdbCredentialsVerifier {
  constructor(private readonly opts: TwitchIgdbCredentialsVerifierOptions) {}

  async verify(input: { clientId: string; clientSecret: string }): Promise<Result<void, VerifyError>> {
    const body = new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'client_credentials',
    }).toString();
    let res: Response;
    try {
      res = await this.opts.fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (e) {
      const isAbort = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
      const err = isAbort ? 'timeout' : 'fetch_failed';
      this.opts.logger.event('integration.igdb.verify.unavailable', { reason: err });
      return errResult({ kind: 'network_unreachable', reason: err });
    }
    if (res.ok) {
      this.opts.logger.event('integration.igdb.verify.success', {});
      return okResult(undefined);
    }
    if (res.status >= 500) {
      this.opts.logger.event('integration.igdb.verify.unavailable', { status: res.status });
      return errResult({ kind: 'twitch_unavailable', status: res.status });
    }
    // 4xx: try to parse a hint about which credential is bad
    const text = await res.text().catch(() => '');
    const lower = text.toLowerCase();
    const reason: 'client_id' | 'client_secret' | 'unknown' =
      lower.includes('invalid client secret') ? 'client_secret'
      : lower.includes('invalid client') ? 'client_id'
      : 'unknown';
    this.opts.logger.event('integration.igdb.verify.invalid', { reason });
    return errResult({ kind: 'invalid_credentials', reason });
  }
}
```
(`okResult`/`errResult` = the `ok`/`err` from `domain/shared/result.ts`,
renamed in your imports if needed — match the project's existing style.)

Run tests → GREEN.

### Step 3: Edge-case hardening
Re-run the full test file once. Then add one more test that the existing
ones might have missed:
- `Twitch responds 200 but with a malformed JSON body` → still `ok` (we
  only care about the status; we don't actually consume the token here).

Make sure your impl does not call `res.json()` on the 200 path. If it does,
remove the call — we deliberately ignore the response body on success.

Confirm `bun --filter @apex/api test` is fully green.

## If you get stuck
If a test about parsing the 4xx reason hint is flaky (Twitch wording
changes), simplify the test to assert that the reason is one of the three
allowed values and that the error kind is `invalid_credentials`. Do NOT
relax the timeout test — `AbortSignal.timeout` is the contract.

If after 2 attempts something still fails:
```
STUCK at Step <N>: <what failed, what error, what hypothesis>
```
