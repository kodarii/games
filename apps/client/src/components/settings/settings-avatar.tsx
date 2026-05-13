import { initials } from '@/lib/avatar';

type SettingsAvatarProps = {
  name: string | null;
  email: string;
  size?: number;
};

const GRADIENT = 'linear-gradient(135deg, #4F6EF7, #9b5de5)';
const LETTER_RE = /\p{L}/u;

export function SettingsAvatar({ name, email, size = 46 }: SettingsAvatarProps) {
  const seed = (name?.trim() || email.split('@')[0] || '').trim();
  const firstChar = seed.charAt(0);
  const glyph = firstChar && LETTER_RE.test(firstChar) ? initials(seed) : '·';

  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: size,
        height: size,
        background: GRADIENT,
        fontSize: Math.round(size * 0.38),
        fontWeight: 600,
        letterSpacing: '0.01em',
      }}
    >
      {glyph}
    </div>
  );
}
