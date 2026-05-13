import { DisabledWithTooltip } from '@/components/settings/disabled-with-tooltip';
import { SettingsAvatar } from '@/components/settings/settings-avatar';
import { SettingsCard } from '@/components/settings/settings-card';
import { SettingsInlineToggle } from '@/components/settings/settings-inline-toggle';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSectionLabel } from '@/components/settings/settings-section-label';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { useId, useRef, useState } from 'react';
import { AccountPasswordForm } from './account-password-form';
import { SignOutOtherDevicesRow } from './account-sessions-card';

export function AccountPage() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return null;

  return (
    <div className="space-y-8">
      <section>
        <SettingsSectionLabel>KONTO</SettingsSectionLabel>
        <SettingsCard>
          <ProfileHeaderRow email={user.email} name={user.name ?? null} />
          <SettingsRow label="Nazwa">
            <ReadonlyValue value={user.name ?? '—'} />
          </SettingsRow>
          <SettingsRow label="Email">
            <ReadonlyValue value={user.email} />
          </SettingsRow>
        </SettingsCard>
      </section>

      <section>
        <SettingsSectionLabel>BEZPIECZEŃSTWO</SettingsSectionLabel>
        <SettingsCard>
          <PasswordRow />
          <SettingsRow
            label="Uwierzytelnianie dwuskładnikowe"
            desc="Dodatkowa warstwa zabezpieczeń przy logowaniu."
          >
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-apex-muted">Niedostępne</span>
              <DisabledWithTooltip>Włącz</DisabledWithTooltip>
            </div>
          </SettingsRow>
          <SignOutOtherDevicesRow />
        </SettingsCard>
      </section>
    </div>
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
      <DisabledWithTooltip>Edytuj awatar</DisabledWithTooltip>
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
        <Button
          ref={triggerRef}
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? 'Anuluj' : 'Zmień hasło'}
        </Button>
      </div>
      <SettingsInlineToggle open={open} id={bodyId}>
        <AccountPasswordForm open={open} onCancel={close} onSuccess={close} />
      </SettingsInlineToggle>
    </div>
  );
}
