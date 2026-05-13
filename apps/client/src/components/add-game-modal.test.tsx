import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression tests for `AddGameModal` (plan 260513-ds2). The client test stack
 * does not include React Testing Library or jsdom, so behavioral verification
 * lives as source-grep assertions that pin the promises of the plan into the
 * file. Pattern matches the existing `protected-route.test.tsx` regression
 * harness.
 *
 * Manual UAT for keyboard/click semantics is documented in
 * `260513-ds2-PLAN.md` <verification>.
 */
describe('AddGameModal regression — 260513-ds2', () => {
  const modalSrc = readFileSync(resolve(__dirname, 'add-game-modal.tsx'), 'utf-8');
  const hookSrc = readFileSync(
    resolve(__dirname, '../hooks/use-add-game-with-metadata.ts'),
    'utf-8',
  );
  const autocompleteSrc = readFileSync(resolve(__dirname, 'title-autocomplete.tsx'), 'utf-8');
  const layoutSrc = readFileSync(resolve(__dirname, 'layout/app-layout.tsx'), 'utf-8');

  test('1. field order: Platform -> Title -> Cover color', () => {
    const platformIdx = modalSrc.indexOf('>Platform<');
    const titleIdx = modalSrc.indexOf('>Title<');
    const colorIdx = modalSrc.indexOf('>Cover color<');
    expect(platformIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeGreaterThan(-1);
    expect(colorIdx).toBeGreaterThan(-1);
    expect(platformIdx).toBeLessThan(titleIdx);
    expect(titleIdx).toBeLessThan(colorIdx);
  });

  test('2. autocomplete picks suggestion: TitleAutocomplete wired, picks set title+providerId atomically', () => {
    // Modal renders TitleAutocomplete and forwards onSelectCandidate -> selectCandidate
    expect(modalSrc).toMatch(/<TitleAutocomplete/);
    expect(modalSrc).toMatch(/onSelectCandidate=\{onCandidatePick\}/);
    expect(modalSrc).toMatch(/selectCandidate\(c\)/);

    // Hook exposes selectCandidate that sets both title AND providerId
    expect(hookSrc).toMatch(/selectCandidate.*useCallback/s);
    expect(hookSrc).toMatch(/setTitle\(c\.title\)/);
    expect(hookSrc).toMatch(/setSelectedProviderId\(c\.providerId\)/);

    // Autocomplete shows MATCHED · IGDB pill when selectedCandidate is set
    expect(autocompleteSrc).toMatch(/MATCHED · IGDB/);
    expect(autocompleteSrc).toMatch(/selectedCandidate &&/);
  });

  test('3. submit without selection uses manual payload (no metadataRef)', () => {
    // The hook builds a "base" payload and only spreads enriched fields when
    // selectedCandidate is non-null. base is collection-flavoured by default.
    expect(hookSrc).toMatch(/kind:.*mode === 'wishlist' \? 'wishlist' : 'owned'/);
    expect(hookSrc).toMatch(/coverColor: color/);
    expect(hookSrc).toMatch(/format: 'physical'/);
    expect(hookSrc).toMatch(/status: 'Backlog'/);
    // metadataRef appears ONLY inside the selectedCandidate branch.
    const lines = hookSrc.split('\n');
    const refLine = lines.findIndex((l) => l.includes('metadataRef:'));
    const sliceAbove = lines.slice(Math.max(0, refLine - 8), refLine).join('\n');
    expect(sliceAbove).toMatch(/selectedCandidate/);
  });

  test('4. submit with selection sends enriched payload', () => {
    expect(hookSrc).toMatch(/coverImage: selectedCandidate\.coverImageUrl/);
    expect(hookSrc).toMatch(/releaseYear: selectedCandidate\.releaseYear/);
    expect(hookSrc).toMatch(/developer: selectedCandidate\.developer/);
    expect(hookSrc).toMatch(/providerName: 'igdb'/);
    expect(hookSrc).toMatch(/providerId: selectedCandidate\.providerId/);
  });

  test('5. wishlist mode: derives from /wishlist path, CTA + redirect change', () => {
    // Mode derivation
    expect(modalSrc).toMatch(/pathname\.startsWith\('\/wishlist'\) \? 'wishlist' : 'collection'/);
    // CTA copy
    expect(modalSrc).toMatch(/cta: 'Add to wishlist'/);
    expect(modalSrc).toMatch(/cta: 'Add game'/);
    // Wishlist redirect
    expect(modalSrc).toMatch(/redirectPrefix: '\/wishlist'/);
    // Same useCreateGameMutation backs both modes (no useCreateWishlistMutation)
    expect(hookSrc).toMatch(/useCreateGameMutation/);
    expect(hookSrc).not.toMatch(/useCreateWishlistMutation/);
    // Wishlist payload has kind:'wishlist' AND coverColor + (when candidate) metadataRef
    expect(hookSrc).toMatch(/kind:.*'wishlist'/);
  });

  test('6. Esc closes modal: Radix default behaviour preserved (no preventDefault on onEscapeKeyDown)', () => {
    // We do NOT call e.preventDefault() on Escape at the AlertDialog.Content
    // level — that means Radix's default Esc-to-close still applies. The
    // TitleAutocomplete swallows Esc only when its dropdown is open (and
    // stopPropagation is used there).
    expect(modalSrc).not.toMatch(/onEscapeKeyDown[^}]*preventDefault/);
    expect(autocompleteSrc).toMatch(/e\.key === 'Escape'/);
    expect(autocompleteSrc).toMatch(/e\.stopPropagation\(\)/);
  });

  test('7. overlay click does NOT close modal (onPointerDownOutside/onInteractOutside intercepted)', () => {
    expect(modalSrc).toMatch(/onPointerDownOutside=\{\(e\) => e\.preventDefault\(\)\}/);
    expect(modalSrc).toMatch(/onInteractOutside=\{\(e\) => e\.preventDefault\(\)\}/);
  });

  test('8. header icon-badge: 34x34 rounded-8 with live cover color + gamepad icon', () => {
    expect(modalSrc).toMatch(/h-\[34px\]/);
    expect(modalSrc).toMatch(/w-\[34px\]/);
    expect(modalSrc).toMatch(/rounded-\[8px\]/);
    expect(modalSrc).toMatch(/background: color/);
    expect(modalSrc).toMatch(/Icon\.gamepad/);
  });

  test('9. footer: light-grey bg + info-circle hint + Cancel + dynamic CTA', () => {
    expect(modalSrc).toMatch(/bg-\[#fafafa\]/);
    expect(modalSrc).toMatch(/More details can be edited after adding\./);
    expect(modalSrc).toMatch(/InfoCircleIcon/);
    expect(modalSrc).toMatch(/>\s*Cancel\s*</);
    expect(modalSrc).toMatch(/\{t\.cta\}/);
  });

  test('10. AppLayout mounts exactly one AddGameModal and no legacy dialogs', () => {
    expect(layoutSrc).toMatch(/<AddGameModal\b/);
    const occurrences = layoutSrc.match(/<AddGameModal\b/g) ?? [];
    expect(occurrences.length).toBe(1);
    expect(layoutSrc).not.toMatch(/AddGameDialog/);
    expect(layoutSrc).not.toMatch(/AddWishlistDialog/);
  });

  test('11. hook contract: no step / goStep1 / goStep2 / withMatch survives', () => {
    expect(hookSrc).not.toMatch(/AddGameStep/);
    expect(hookSrc).not.toMatch(/\bstep\b\s*:/);
    expect(hookSrc).not.toMatch(/goStep1/);
    expect(hookSrc).not.toMatch(/goStep2/);
    expect(hookSrc).not.toMatch(/withMatch/);
  });

  test('12. 250ms title debounce drives candidates query', () => {
    expect(hookSrc).toMatch(/setTimeout\([^,]*,\s*250\)/);
    expect(hookSrc).toMatch(/debouncedTitle/);
    expect(hookSrc).toMatch(
      /useMetadataCandidatesQuery\(debouncedTitle, platform, enableCandidates\)/,
    );
  });
});
