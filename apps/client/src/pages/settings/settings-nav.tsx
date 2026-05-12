import { Icon } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { NavLink } from 'react-router-dom';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-apex-hint">
      {children}
    </div>
  );
}

function DisabledNavItem({
  icon,
  label,
}: {
  icon: keyof typeof Icon;
  label: string;
}) {
  const Svg = Icon[icon];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-disabled="true"
          className="flex cursor-not-allowed select-none items-center gap-2 rounded-[7px] px-4 py-2 text-[13px] text-apex-muted"
        >
          <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center opacity-55">
            <Svg size={14} />
          </span>
          <span className="flex-1">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>Wkrótce</TooltipContent>
    </Tooltip>
  );
}

export function SettingsNav() {
  return (
    <TooltipProvider delayDuration={150}>
      <nav className="flex h-full flex-col gap-1">
        <SectionLabel>KONTO</SectionLabel>
        <ul className="list-none">
          <li>
            <NavLink
              to="/settings/account"
              className={({ isActive }) =>
                cn(
                  'mx-[6px] flex items-center gap-2 rounded-[7px] px-4 py-2 text-[13px] select-none',
                  isActive
                    ? 'bg-[oklch(95%_0.02_220)] font-semibold text-apex-accent'
                    : 'text-apex-ink-3 hover:bg-apex-surface-hover hover:text-apex-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-[17px] w-[17px] shrink-0 items-center justify-center',
                      isActive ? 'text-apex-accent' : 'opacity-55',
                    )}
                  >
                    <Icon.user size={14} />
                  </span>
                  <span className="flex-1">Konto</span>
                </>
              )}
            </NavLink>
          </li>
        </ul>
        <SectionLabel>POZOSTAŁE</SectionLabel>
        <ul className="list-none">
          <li className="mx-[6px]">
            <DisabledNavItem icon="plug" label="Integracje" />
          </li>
          <li className="mx-[6px]">
            <DisabledNavItem icon="database" label="Dane" />
          </li>
          <li className="mx-[6px]">
            <DisabledNavItem icon="palette" label="Wygląd" />
          </li>
        </ul>
      </nav>
    </TooltipProvider>
  );
}
