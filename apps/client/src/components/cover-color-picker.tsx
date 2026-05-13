import { COVER_COLORS } from '@/lib/avatar';

export type CoverColorPickerSize = 'sm' | 'md';

const SIZE_MAP: Record<CoverColorPickerSize, { swatch: number; radius: number; gap: number }> = {
  sm: { swatch: 22, radius: 5, gap: 6 },
  md: { swatch: 26, radius: 7, gap: 8 },
};

export function CoverColorPicker({
  value,
  onChange,
  className,
  size = 'md',
}: {
  value: string | null | undefined;
  onChange: (color: string) => void;
  className?: string;
  size?: CoverColorPickerSize;
}) {
  const dim = SIZE_MAP[size];
  return (
    <div className={className} style={{ display: 'flex', gap: dim.gap, flexWrap: 'wrap' }}>
      {COVER_COLORS.map((c) => {
        const selected = c === value;
        return (
          <button
            type="button"
            key={c}
            onClick={() => onChange(c)}
            aria-label={`Cover color ${c}`}
            aria-pressed={selected}
            style={{
              width: dim.swatch,
              height: dim.swatch,
              borderRadius: dim.radius,
              background: c,
              cursor: 'pointer',
              outline: selected ? `2.5px solid ${c}` : '2.5px solid transparent',
              outlineOffset: 2,
              transition: 'outline .1s',
              padding: 0,
              border: 'none',
            }}
          />
        );
      })}
    </div>
  );
}
