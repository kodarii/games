import { avatarColor, initials } from '@/lib/avatar';
import { cn } from '@/lib/utils';

export function GameCover({ name, className }: { name: string; className?: string }) {
  const trimmed = name?.trim() ?? '';
  const bg = trimmed ? avatarColor(trimmed) : '#c8c8c8';
  const glyph = trimmed ? initials(trimmed) : '?';
  return (
    <div
      className={cn(
        'relative aspect-[3/4] w-full overflow-hidden rounded-[14px] shadow-apex-2',
        className,
      )}
      style={{ background: bg }}
      aria-hidden
    >
      <div className="absolute inset-0 grid place-items-center">
        <span
          className="select-none font-bold leading-none text-white drop-shadow-sm"
          style={{ fontSize: 'clamp(48px, 18vw, 128px)' }}
        >
          {glyph}
        </span>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/15" />
    </div>
  );
}
