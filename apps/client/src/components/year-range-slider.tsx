import * as Slider from '@radix-ui/react-slider';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface YearRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onCommit: (range: [number, number]) => void;
}

export function YearRangeSlider({ min, max, value, onCommit }: YearRangeSliderProps) {
  const [local, setLocal] = useState<[number, number]>(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = (next: [number, number]) => {
    let [a, b] = next;
    if (a > b) {
      [a, b] = [b, a];
      toast.warning('Switched range');
    }
    setLocal([a, b]);
    onCommit([a, b]);
  };

  const handleInputCommit = (idx: 0 | 1, raw: string) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      setLocal(value);
      return;
    }
    const next: [number, number] = idx === 0 ? [n, local[1]] : [local[0], n];
    commit(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <Slider.Root
        className="relative flex w-full items-center select-none touch-none h-5"
        min={min}
        max={max}
        step={1}
        value={local}
        onValueChange={(v) => setLocal(v as [number, number])}
        onValueCommit={(v) => onCommit(v as [number, number])}
      >
        <Slider.Track className="relative flex-1 h-1 rounded-full bg-apex-line-2">
          <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Year from"
          className="block h-4 w-4 rounded-full border-2 border-blue-500 bg-white hover:ring-4 ring-blue-500/20 focus-visible:ring-4 focus-visible:outline-none"
        />
        <Slider.Thumb
          aria-label="Year to"
          className="block h-4 w-4 rounded-full border-2 border-blue-500 bg-white hover:ring-4 ring-blue-500/20 focus-visible:ring-4 focus-visible:outline-none"
        />
      </Slider.Root>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={local[0]}
          onChange={(e) => setLocal([Number(e.target.value) || min, local[1]])}
          onBlur={(e) => handleInputCommit(0, e.target.value)}
          className="w-full text-center px-2 py-1 border border-apex-line-2 rounded-[6px] text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Year from input"
        />
        <span className="text-apex-muted">–</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={local[1]}
          onChange={(e) => setLocal([local[0], Number(e.target.value) || max])}
          onBlur={(e) => handleInputCommit(1, e.target.value)}
          className="w-full text-center px-2 py-1 border border-apex-line-2 rounded-[6px] text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Year to input"
        />
      </div>
    </div>
  );
}
