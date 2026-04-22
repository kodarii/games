import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/utils';
import { NavLink } from 'react-router-dom';

type NavEntry = {
  label: string;
  icon: IconName;
  to: string;
  arrow?: boolean;
};

const mainNav: NavEntry[] = [{ label: 'Games', icon: 'gamepad', to: '/games', arrow: true }];

const bottomNav: NavEntry[] = [
  { label: 'Settings', icon: 'settings', to: '/settings' },
  { label: 'Support', icon: 'support', to: '/support' },
];

const favs = [
  { label: 'PS3', color: '#6366f1', key: '\u23181' },
  { label: 'PS4', color: '#ef4444', key: '\u23182' },
  { label: 'PS5', color: '#ec4899', key: '\u23183' },
];

function NavRow({ entry }: { entry: NavEntry }) {
  const Svg = Icon[entry.icon];
  const Chev = Icon.chevright;
  return (
    <NavLink
      to={entry.to}
      className={({ isActive }) =>
        cn(
          'relative mx-[6px] flex items-center gap-[10px] rounded-[7px] px-4 py-[10px] text-[13.5px] text-apex-ink-3 transition-colors select-none',
          'hover:bg-apex-surface-hover hover:text-apex-ink',
          isActive && 'bg-apex-surface-hover font-semibold text-apex-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute -left-[9px] top-[6px] bottom-[6px] w-[3px] rounded-r-[3px] bg-apex-accent" />
          )}
          <span
            className={cn(
              'flex h-[17px] w-[17px] shrink-0 items-center justify-center',
              isActive ? 'text-apex-accent opacity-100' : 'opacity-55',
            )}
          >
            <Svg size={14} />
          </span>
          <span className="flex-1">{entry.label}</span>
          {entry.arrow && (
            <span className="ml-auto flex items-center text-apex-kbd">
              <Chev size={12} />
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'px-4 pb-[6px] pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-apex-hint',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="relative flex w-[248px] min-w-[248px] flex-col overflow-visible border-r border-apex-line-3 bg-white text-[13.5px]">
      <div className="flex items-center gap-[10px] border-b border-apex-line-5 px-4 pb-[14px] pt-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-apex-ink">
          <Icon.logoMark size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-[1.25] text-apex-ink">Apex</div>
          <div className="text-[10.5px] leading-[1.3] text-apex-muted">Finance App Technology</div>
        </div>
      </div>

      <SectionLabel>Main</SectionLabel>
      <nav className="flex flex-col">
        {mainNav.map((n) => (
          <NavRow key={n.label} entry={n} />
        ))}
      </nav>

      <SectionLabel className="mt-[6px]">Favs</SectionLabel>
      <nav className="flex flex-col">
        {favs.map((f) => (
          <div
            key={f.label}
            className="mx-[6px] flex cursor-pointer items-center gap-[10px] rounded-[7px] px-4 py-[10px] text-[13.5px] text-apex-ink-3 transition-colors hover:bg-apex-surface-hover hover:text-apex-ink"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.color }} />
            {f.label}
            <span className="ml-auto text-[11px] text-apex-kbd">{f.key}</span>
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="pb-1">
        {bottomNav.map((n) => (
          <NavRow key={n.label} entry={n} />
        ))}
        <div className="mx-[14px] mb-1 mt-[6px] h-px bg-apex-line-4" />
        <div className="mx-[10px] mb-[6px] mt-2 flex cursor-pointer items-center gap-[10px] rounded-[10px] border border-apex-line-4 p-[10px] transition-colors hover:bg-apex-surface-chip">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#8899cc] to-[#99aadd] text-[12px] font-semibold text-white">
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
              <circle cx="17" cy="13" r="6" fill="#c9d3e8" />
              <ellipse cx="17" cy="30" rx="12" ry="9" fill="#c9d3e8" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-[13px] font-semibold text-apex-ink">
                Arthur Taylor
              </span>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <circle cx="7" cy="7" r="6.5" fill="#3b82f6" />
                <path
                  d="M4 7l2 2 4-4"
                  stroke="#fff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </div>
            <div className="truncate text-[11px] text-apex-muted">arthur@apex.com</div>
          </div>
          <span className="shrink-0 text-apex-kbd">
            <Icon.chevright size={12} />
          </span>
        </div>
      </div>
    </aside>
  );
}
