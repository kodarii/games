export const COVER_COLORS = [
  '#52b788',
  '#4361ee',
  '#e07a5f',
  '#9b5de5',
  '#f4a261',
  '#2d6a4f',
  '#e63946',
] as const;

export function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % COVER_COLORS.length;
  return COVER_COLORS[h];
}

export function coverColorFor(game: { title: string; coverColor?: string | null }) {
  return game.coverColor ?? avatarColor(game.title);
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
