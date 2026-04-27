import { COVER_COLORS } from '@/lib/avatar';

export function CoverColorPicker({
  value,
  onChange,
  className,
}: {
  value: string | null | undefined;
  onChange: (color: string) => void;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
    >
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
              width: 22,
              height: 22,
              borderRadius: 5,
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
