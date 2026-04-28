import { avatarColor, initials } from '@/lib/avatar';
import { cn } from '@/lib/utils';

export type AvatarShape = 'circle' | 'rect';

export function Avatar({
  shape = 'circle',
  size = 40,
  src,
  name,
  color,
  className,
}: {
  shape?: AvatarShape;
  size?: number;
  src?: string | null;
  name?: string;
  color?: string | null;
  className?: string;
}) {
  const trimmed = name?.trim() ?? '';
  const bg = color ?? (trimmed ? avatarColor(trimmed) : '#c8c8c8');
  const glyph = trimmed ? initials(trimmed) : '?';
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-[4px]';
  const height = size;
  const width = shape === 'circle' ? size : Math.round(size * 0.75);
  const fontSize = Math.max(10, Math.round(Math.min(width, height) * 0.36));

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden font-semibold text-white',
        shapeClass,
        className,
      )}
      style={{ width, height, background: bg, fontSize }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span>{glyph}</span>}
    </div>
  );
}
