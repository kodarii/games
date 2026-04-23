import { cn } from '@/lib/utils';

export type PillSelectOption<T extends string> = {
  value: T;
  label?: string;
  color?: string;
};

export function PillSelect<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: PillSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="radiogroup">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            className={cn(
              'flex select-none items-center gap-[6px] rounded-full border px-3 py-[6px] text-[12px] transition-all cursor-pointer',
              selected
                ? 'border-apex-accent bg-[#EEF2FF] font-medium text-[#3b5bdb]'
                : 'border-apex-line-2 text-apex-ink-4 hover:border-apex-faint',
            )}
          >
            <input
              type="radio"
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.color && (
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: opt.color }}
                aria-hidden
              />
            )}
            {opt.label ?? opt.value}
          </label>
        );
      })}
    </div>
  );
}
