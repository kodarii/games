# IGDB integration tile — implementation plan

Goal: replace the fake "Konfiguruj/Rozłącz" tile in settings with a real
credential-management flow. Credentials move from env vars to the SQLite
database, secrets are encrypted at rest, and a successful Twitch verification
is required before they are stored.

## Phases

Each phase is a self-contained mini-plan. Run them in order. Each phase is
designed to be handed to a fresh agent session — no carry-over context
needed beyond what the file states. Files written by phase N are consumed
by phase N+1 via the "Files to read but NOT edit" section.

| # | File | What it produces |
|---|------|------------------|
| 1 | `phase-01-schema-migration-and-cipher.md` | Drizzle table `integration_credentials` (migration 0018), `IntegrationCipher` port + AES-256-GCM impl, round-trip tests |
| 2 | `phase-02-domain-aggregate-and-repository.md` | `IntegrationCredentials` aggregate, `ClientId`/`ClientSecret` value objects, repo port + Drizzle adapter, IDOR tests |
| 3 | `phase-03-twitch-credentials-verifier.md` | `IgdbCredentialsVerifier` port + Twitch impl, status mapping (200/401/403/timeout), tests |
| 4 | `phase-04-use-cases-and-chain-holder.md` | `SaveIgdbIntegration` + `ClearIgdbIntegration` use cases, `IgdbChainHolder` swap-able wiring, transaction boundaries |
| 5 | `phase-05-routes-and-env-cleanup.md` | `GET/PUT/DELETE /api/integrations/igdb`, idempotency, env-var cleanup, dynamic `/api/games/metadata/status` |
| 6 | `phase-06-frontend-card-and-form.md` | `IgdbIntegrationCard` with collapsed/expanded states, save form with FormData, mutation hooks |
| 7 | `phase-07-frontend-disconnect-and-wiring.md` | "Rozłącz" AlertDialog, query invalidation across add-game-modal, e2e click-through |

## Locked product decisions

1. Credentials live ONLY in the database. `IGDB_CLIENT_ID` and
   `IGDB_CLIENT_SECRET` are removed from `apps/api/src/infrastructure/config/env.ts`.
   `IGDB_TIMEOUT_MS` and `IGDB_CACHE_TTL_DAYS` stay (they are infra knobs, not secrets).
2. Save changes is blocking-verify: backend calls Twitch's OAuth2 token
   endpoint. 200 → store + `lastVerifiedAt = now` + `enabled = true` (first
   save only) + swap chain. Non-200 → no write, inline error to the client.
3. The toggle is part of the form (dirty + Save). It is disabled in UI while
   `hasSecret === false`. After the first verified save, it becomes
   clickable and defaults to ON.
4. "Rozłącz" is a separate red button with an `AlertDialog` confirm.
   `DELETE /api/integrations/igdb` deletes the row, flushes
   `igdb_oauth_token`, resets the circuit breaker, swaps the chain to `null`.
5. Client ID is displayed masked when loaded from DB: first 12 chars +
   `…` + last 4 (e.g. `apex-public-…d9f2`). Clicking the field clears it
   and accepts a fresh value.
6. `CONNECTED` badge + green tick are only shown when
   `enabled === true && lastVerifiedAt !== null`.
7. Secret is encrypted at rest with AES-256-GCM. Key is derived from
   `BETTER_AUTH_SECRET` via HKDF-SHA256 with info `'apex.integration-cipher.v1'`.
   Storage format: base64 of `iv ‖ ciphertext ‖ authTag` in a single column.
8. The IGDB chain in `wiring.ts` becomes swappable via an `IgdbChainHolder`.
   On boot it reads the active row from DB and builds the chain.
   Use-cases call `holder.swap(...)` after a successful commit.
