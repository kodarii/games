import type { ReactNode } from 'react';

export function FormValue({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-[36px] py-[8px] text-[13px] text-apex-ink">
      {children || <span className="text-apex-faint">—</span>}
    </div>
  );
}
