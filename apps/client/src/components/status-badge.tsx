import type { ReactNode } from 'react';

export type StatusVariant =
  | 'progress'
  | 'info'
  | 'pending'
  | 'done'
  | 'inactive';

function BlueCircle() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="7" cy="7" r="7" className="fill-apex-status-progress" />
    </svg>
  );
}

function InfoCircle() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="7" cy="7" r="7" className="fill-apex-status-progress" />
      <text
        x="7"
        y="11"
        textAnchor="middle"
        fill="white"
        fontSize="9"
        fontFamily="Inter,sans-serif"
        fontWeight="700"
      >
        i
      </text>
    </svg>
  );
}

function Triangle() {
  return (
    <svg
      width="15"
      height="13"
      viewBox="0 0 15 13"
      className="shrink-0"
      aria-hidden
    >
      <path d="M7.5 1L14 12.5H1L7.5 1z" className="fill-apex-status-pending" />
    </svg>
  );
}

function GreenCheck() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="7" cy="7" r="7" className="fill-apex-status-done" />
      <path
        d="M4 7l2 2 4-4"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function RedCircle() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="7" cy="7" r="7" className="fill-apex-status-inactive" />
    </svg>
  );
}

const GLYPHS: Record<StatusVariant, () => ReactNode> = {
  progress: BlueCircle,
  info: InfoCircle,
  pending: Triangle,
  done: GreenCheck,
  inactive: RedCircle,
};

export function StatusBadge({
  variant,
  label,
}: {
  variant: StatusVariant;
  label: string;
}) {
  const Glyph = GLYPHS[variant];
  return (
    <span className="inline-flex items-center gap-[6px] whitespace-nowrap text-[11px] text-apex-ink">
      <Glyph />
      {label}
    </span>
  );
}
