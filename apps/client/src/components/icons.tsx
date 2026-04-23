import type { ReactNode } from 'react';

type IconProps = {
  size?: number;
  className?: string;
};

type Svg = (props: IconProps) => ReactNode;

const svg = (children: ReactNode, vb = '0 0 16 16'): Svg => {
  return ({ size = 16, className }) => (
    <svg
      width={size}
      height={size}
      viewBox={vb}
      fill="none"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden
    >
      {children}
    </svg>
  );
};

export const Icon = {
  grid: svg(
    <>
      <rect x="2.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </>,
  ),
  cal: svg(
    <>
      <rect
        x="2.5"
        y="3.5"
        width="11"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M2.5 7h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>,
  ),
  coffee: svg(
    <>
      <circle cx="8" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5.5v3l2 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 3.5V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>,
  ),
  folder: svg(
    <>
      <rect x="3" y="4" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 8h5M5.5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>,
  ),
  users: svg(
    <>
      <circle cx="8" cy="6" r="2.8" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>,
  ),
  zap: svg(
    <>
      <path
        d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="6" cy="4.5" r="1.5" fill="white" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10.5" cy="8" r="1.5" fill="white" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.5" cy="11.5" r="1.5" fill="white" stroke="currentColor" strokeWidth="1.3" />
    </>,
  ),
  gift: svg(
    <path
      d="M8 2.5l1.5 3.2 3.5.5-2.5 2.4.6 3.4L8 10.4l-3.1 1.6.6-3.4L3 6.2l3.5-.5z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />,
  ),
  file: svg(
    <>
      <path
        d="M4 2h5.5L12 4.5V13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M9.5 2v3H12" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 7.5h4M6 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>,
  ),
  settings: svg(
    <>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 2.5V4M8 12v1.5M2.5 8H4M12 8h1.5M4.1 4.1l1 1M10.9 10.9l1 1M4.1 11.9l1-1M10.9 5.1l1-1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </>,
  ),
  support: svg(
    <>
      <path
        d="M3.5 9V8a4.5 4.5 0 019 0v1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect x="2.5" y="9" width="2" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="11.5" y="9" width="2" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M13.5 12.5v.5a2 2 0 01-2 2H9.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </>,
  ),
  bell: svg(
    <>
      <path
        d="M8 2a4.5 4.5 0 00-4.5 4.5V9L2 11h12l-1.5-2V6.5A4.5 4.5 0 008 2z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M6.5 11a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" />
    </>,
  ),
  chevdown: svg(
    <path
      d="M4 6.5l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  chevright: svg(
    <path
      d="M6.5 4l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  chevupdown: svg(
    <path
      d="M5 7l3-3 3 3M5 10l3 3 3-3"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  chevup: svg(
    <path
      d="M4 9.5l4-4 4 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  gamepad: svg(
    <>
      <path
        d="M4.5 6h7a3 3 0 013 3v1.3a1.7 1.7 0 01-3.1.9l-.7-1.2h-5.4l-.7 1.2A1.7 1.7 0 011.5 10.3V9a3 3 0 013-3z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
      />
      <path
        d="M4.5 8.5h2M5.5 7.5v2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="10" cy="8" r="0.7" fill="currentColor" />
      <circle cx="11.2" cy="9" r="0.7" fill="currentColor" />
    </>,
  ),
  sort: svg(
    <path
      d="M8 3.5v9M5 10l3 3 3-3M5 6.5l3-3 3 3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  search: svg(
    <>
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>,
  ),
  gear: svg(
    <>
      <path
        d="M6.5 2.5h3l.5 1.5a5 5 0 011.2.7l1.5-.5 1.5 2.6-1.2 1.1a5 5 0 010 1.2l1.2 1.1-1.5 2.6-1.5-.5a5 5 0 01-1.2.7l-.5 1.5h-3l-.5-1.5a5 5 0 01-1.2-.7l-1.5.5L1.8 10l1.2-1.1a5 5 0 010-1.2L1.8 6.6l1.5-2.6 1.5.5a5 5 0 011.2-.7l.5-1.8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
    </>,
  ),
  more: svg(
    <>
      <circle cx="8" cy="3.5" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1" fill="currentColor" />
    </>,
  ),
  plus: svg(
    <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  ),
  pgfirst: svg(
    <path
      d="M10 4L6 8l4 4M5 4v8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  pglast: svg(
    <path
      d="M6 4l4 4-4 4M11 4v8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  pgprev: svg(
    <path
      d="M9.5 4.5L6 8l3.5 3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  pgnext: svg(
    <path
      d="M6.5 4.5L10 8l-3.5 3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  ),
  logoMark: svg(
    <>
      <path
        d="M4 14L9 7l5 7"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 14l5-7"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
    '0 0 20 20',
  ),
} as const;

export type IconName = keyof typeof Icon;
