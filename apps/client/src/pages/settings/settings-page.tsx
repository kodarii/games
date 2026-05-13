import { Icon } from '@/components/icons';
import { AppHeader } from '@/components/layout/app-header';
import { DisabledWithTooltip } from '@/components/settings/disabled-with-tooltip';
import { IgdbIntegrationCard } from '@/components/settings/igdb-integration-card';
import { SettingsAvatar } from '@/components/settings/settings-avatar';
import { SettingsCard } from '@/components/settings/settings-card';
import { SettingsInlineToggle } from '@/components/settings/settings-inline-toggle';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSectionLabel } from '@/components/settings/settings-section-label';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useId, useRef, useState } from 'react';
import { AccountPasswordForm } from './account-password-form';

export function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <AppHeader>
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center text-apex-ink-3">
            <Icon.settings size={16} />
          </span>
          <span className="text-[15px] font-bold text-apex-ink">Ustawienia</span>
        </AppHeader>
        <div className="min-w-0 flex-1 overflow-y-auto bg-[#fafafa]">
          <div className="mx-auto w-full max-w-[720px] px-6 pb-20 pt-8">
            <div className="space-y-8">
              <AccountSection email={user.email} name={user.name ?? null} />
              <SecuritySection />
              <IntegrationsSection />
              <PreferencesSection />
              <DangerZoneSection />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function AccountSection({ email, name }: { email: string; name: string | null }) {
  return (
    <section>
      <SettingsSectionLabel>KONTO</SettingsSectionLabel>
      <SettingsCard>
        <ProfileHeaderRow email={email} name={name} />
        <SettingsRow label="Nazwa">
          <ReadonlyValue value={name ?? '—'} />
        </SettingsRow>
        <SettingsRow label="Email">
          <ReadonlyValue value={email} />
        </SettingsRow>
      </SettingsCard>
    </section>
  );
}

function SecuritySection() {
  return (
    <section>
      <SettingsSectionLabel>BEZPIECZEŃSTWO</SettingsSectionLabel>
      <SettingsCard>
        <PasswordRow />
      </SettingsCard>
    </section>
  );
}

function IntegrationsSection() {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <SettingsSectionLabel>INTEGRACJE</SettingsSectionLabel>
        <span className="pb-0.5 text-[12px] text-apex-muted">
          Wzbogacaj kolekcję metadanymi z zewnętrznych baz.
        </span>
      </div>
      <div className="space-y-2.5">
        <IgdbIntegrationCard />
        <IntegrationCard
          mark={<IntegrationMark label="RA" gradient="linear-gradient(135deg, #1f2937, #374151)" />}
          name="RAWG"
          tagline="Video games database & discovery"
          description="Zrzuty ekranu, oceny, sklepy i statystyki graczy z bazy ponad 800k gier."
          rightSlot={<ConnectButton />}
        />
        <IntegrationCard
          mark={<IntegrationMark label="MO" gradient="linear-gradient(135deg, #c2410c, #ea580c)" />}
          name="MobyGames"
          tagline="Historical game archive"
          description="Najbogatsza historyczna baza dla starszych platform i klasyków."
          rightSlot={<ConnectButton />}
        />
        <div className="flex items-center gap-4 rounded-[10px] border border-dashed border-apex-line-4 bg-white px-4 py-3.5">
          <div className="flex items-center -space-x-1">
            <MiniBadge label="HL" gradient="linear-gradient(135deg, #f59e0b, #d97706)" />
            <MiniBadge label="ST" gradient="linear-gradient(135deg, #475569, #1e293b)" />
            <MiniBadge label="GO" gradient="linear-gradient(135deg, #7c3aed, #5b21b6)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-apex-ink">Więcej integracji wkrótce</div>
            <div className="mt-0.5 text-[12px] text-apex-muted">
              HowLongToBeat · Steam · GOG i inne.
            </div>
          </div>
          <DisabledWithTooltip variant="outline">Poproś</DisabledWithTooltip>
        </div>
      </div>
    </section>
  );
}

function PreferencesSection() {
  return (
    <section>
      <SettingsSectionLabel>PREFERENCJE</SettingsSectionLabel>
      <SettingsCard>
        <SettingsRow label="Domyślny widok" desc="Jak gry są wyświetlane po otwarciu biblioteki.">
          <FakeSelect value="Lista" />
        </SettingsRow>
        <SettingsRow label="Domyślny status" desc="Status przypisywany nowo dodanym grom.">
          <FakeSelect value="Backlog" />
        </SettingsRow>
        <SettingsRow
          label="Powiadomienia e-mail"
          desc="Tygodniowy podsumowanie dopasowań z watchlisty."
        >
          <FakeToggle on={false} />
        </SettingsRow>
      </SettingsCard>
    </section>
  );
}

function DangerZoneSection() {
  return (
    <section>
      <SettingsSectionLabel danger>STREFA NIEBEZPIECZNA</SettingsSectionLabel>
      <SettingsCard danger>
        <SettingsRow
          label="Zamknij konto"
          desc="Trwale usuń konto, bibliotekę i wszystkie powiązane dane. Tej operacji nie można cofnąć."
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-disabled="true"
                tabIndex={0}
                className="inline-flex h-8 cursor-not-allowed select-none items-center justify-center whitespace-nowrap rounded-md border border-red-300 bg-white px-3 text-[12.5px] font-medium text-red-600 opacity-60"
              >
                Zamknij konto…
              </button>
            </TooltipTrigger>
            <TooltipContent>Wkrótce</TooltipContent>
          </Tooltip>
        </SettingsRow>
      </SettingsCard>
    </section>
  );
}

function ProfileHeaderRow({ email, name }: { email: string; name: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-apex-line-4 px-4 py-4 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <SettingsAvatar name={name} email={email} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-apex-ink">{name ?? '—'}</div>
          <div className="truncate text-[12px] text-apex-muted">{email}</div>
        </div>
      </div>
      <DisabledWithTooltip variant="outline">Edytuj awatar</DisabledWithTooltip>
    </div>
  );
}

function ReadonlyValue({ value }: { value: string }) {
  return (
    <div className="max-w-[260px] cursor-default select-text rounded-[7px] border border-apex-line-4 bg-apex-surface-hover px-2.5 py-1.5 text-right text-[12.5px] text-apex-ink-6">
      {value}
    </div>
  );
}

function PasswordRow() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className="border-b border-apex-line-4 last:border-b-0">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-apex-ink">Hasło</div>
          <div className="mt-0.5 text-[12px] text-apex-muted">
            Aktualizuj swoje hasło logowania.
          </div>
        </div>
        {!open && (
          <Button
            ref={triggerRef}
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(true)}
          >
            Zmień hasło
          </Button>
        )}
      </div>
      <SettingsInlineToggle open={open} id={bodyId}>
        <AccountPasswordForm open={open} onCancel={close} onSuccess={close} />
      </SettingsInlineToggle>
    </div>
  );
}

type IntegrationCardProps = {
  mark: React.ReactNode;
  name: string;
  tagline: string;
  description: string;
  connected?: boolean;
  rightSlot: React.ReactNode;
};

function IntegrationCard({
  mark,
  name,
  tagline,
  description,
  connected,
  rightSlot,
}: IntegrationCardProps) {
  return (
    <div className="flex items-start gap-4 rounded-[10px] border border-apex-line-4 bg-white px-4 py-3.5">
      <div className="relative shrink-0">
        {mark}
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
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-apex-ink">{name}</span>
          <span className="text-[12px] text-apex-muted">{tagline}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-apex-ink-6">{description}</p>
      </div>
      <div className="shrink-0 self-center">{rightSlot}</div>
    </div>
  );
}

function IntegrationMark({ label, gradient }: { label: string; gradient: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[11px] font-bold tracking-wide text-white"
      style={{ background: gradient }}
    >
      {label}
    </div>
  );
}

function MiniBadge({ label, gradient }: { label: string; gradient: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-white text-[9.5px] font-bold tracking-wide text-white"
      style={{ background: gradient }}
    >
      {label}
    </div>
  );
}

function ConnectButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          tabIndex={0}
          className="inline-flex h-8 cursor-not-allowed select-none items-center justify-center whitespace-nowrap rounded-md bg-apex-accent px-3 text-[12.5px] font-medium text-white opacity-60"
        >
          Połącz
        </button>
      </TooltipTrigger>
      <TooltipContent>Wkrótce</TooltipContent>
    </Tooltip>
  );
}

function FakeSelect({ value }: { value: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          tabIndex={0}
          className="inline-flex h-8 min-w-[120px] cursor-not-allowed select-none items-center justify-between gap-2 rounded-[7px] border border-apex-line-4 bg-white px-2.5 text-[12.5px] text-apex-ink-6 opacity-70"
        >
          <span>{value}</span>
          <Icon.chevdown size={12} className="text-apex-muted" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Wkrótce</TooltipContent>
    </Tooltip>
  );
}

function FakeToggle({ on }: { on: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          aria-pressed={on}
          tabIndex={0}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full border border-apex-line-4 opacity-70 transition-colors',
            on ? 'bg-apex-accent' : 'bg-apex-surface-hover',
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
              on ? 'translate-x-[18px]' : 'translate-x-[2px]',
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>Wkrótce</TooltipContent>
    </Tooltip>
  );
}
