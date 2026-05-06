import { Icon, type IconName } from '@/components/icons';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { signOut, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';

type NavEntry = {
  label: string;
  icon: IconName;
  to: string;
  addTo?: string;
};

const mainNav: NavEntry[] = [
  { label: 'Games', icon: 'gamepad', to: '/games', addTo: '/games?add=1' },
  { label: 'Wishlist', icon: 'heart', to: '/wishlist', addTo: '/wishlist?add=1' },
  { label: 'Dictionaries', icon: 'rows', to: '/dictionaries' },
  { label: 'Data', icon: 'rows', to: '/data' },
];

const bottomNav: NavEntry[] = [
  { label: 'Settings', icon: 'settings', to: '/settings' },
];

function NavRow({ entry }: { entry: NavEntry }) {
  const Svg = Icon[entry.icon];
  const { pathname } = useLocation();
  const active = pathname.startsWith(entry.to);
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenuItem className="relative mx-[6px]">
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          'h-auto rounded-[7px] px-4 py-[10px] text-[13.5px] select-none',
          active
            ? 'bg-[oklch(95%_0.02_220)] font-semibold text-apex-accent'
            : 'text-apex-ink-3 hover:bg-apex-surface-hover hover:text-apex-ink',
        )}
      >
        <NavLink to={entry.to} onClick={closeMobile}>
          <span
            className={cn(
              'flex h-[17px] w-[17px] shrink-0 items-center justify-center',
              active ? 'text-apex-accent' : 'opacity-55',
            )}
          >
            <Svg size={14} />
          </span>
          <span className="flex-1">{entry.label}</span>
          {entry.addTo && <span className="w-[18px] shrink-0" />}
        </NavLink>
      </SidebarMenuButton>
      {entry.addTo && (
        <Link
          to={entry.addTo}
          onClick={closeMobile}
          className="absolute right-4 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-[4px] bg-apex-accent text-white hover:bg-apex-accent/90"
          aria-label="Add new"
        >
          <Icon.plus size={11} />
        </Link>
      )}
    </SidebarMenuItem>
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

function UserCard() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const user = session?.user;
  if (!user) return null;

  const display = user.name?.trim() || user.email.split('@')[0];

  const onLogout = async () => {
    await signOut();
    qc.removeQueries({ queryKey: ['games'] });
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="mx-[10px] mb-[6px] mt-2 flex w-[calc(100%-20px)] cursor-pointer items-center gap-[10px] rounded-[10px] border border-apex-line-4 p-[10px] transition-colors hover:bg-apex-surface-chip"
        >
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#8899cc] to-[#99aadd] text-[12px] font-semibold text-white">
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
              <circle cx="17" cy="13" r="6" fill="#c9d3e8" />
              <ellipse cx="17" cy="30" rx="12" ry="9" fill="#c9d3e8" />
            </svg>
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[13px] font-semibold text-apex-ink">
              {display}
            </div>
            <div className="truncate text-[11px] text-apex-muted">
              {user.email}
            </div>
          </div>
          <span className="shrink-0 text-apex-kbd">
            <Icon.chevright size={12} />
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-50 min-w-[200px] rounded-lg border border-apex-line-4 bg-white p-1 shadow-lg"
        >
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-apex-ink outline-none hover:bg-apex-surface-hover"
            onSelect={(e) => {
              e.preventDefault();
              onLogout();
            }}
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Sidebar() {
  return (
    <ShadcnSidebar collapsible="offcanvas">
      <SidebarHeader className="h-auto border-b border-apex-line-5 px-4 pb-[14px] pt-4">
        <div className="flex items-center gap-[10px]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-apex-ink">
            <Icon.logoMark size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-[1.25] text-apex-ink">
              Apex
            </div>
            <div className="text-[10.5px] leading-[1.3] text-apex-muted">
              Finance App Technology
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SectionLabel>Main</SectionLabel>
        <SidebarMenu>
          {mainNav.map((n) => (
            <NavRow key={n.label} entry={n} />
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="pb-1">
        <SidebarMenu>
          {bottomNav.map((n) => (
            <NavRow key={n.label} entry={n} />
          ))}
        </SidebarMenu>
        <div className="mx-[14px] mb-1 mt-[6px] h-px bg-apex-line-4" />
        <UserCard />
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
