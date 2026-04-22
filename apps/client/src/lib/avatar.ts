const AVATAR_COLORS = [
  '#6b7fd7',
  '#d77b6b',
  '#7ab87a',
  '#c49a3c',
  '#7bc9d7',
  '#a87fd7',
  '#d78f7b',
  '#7bd7b0',
  '#d75b8a',
  '#5bb3d7',
];

export function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
