import { cn } from '@/lib/utils';

type SettingsSectionLabelProps = {
  children: React.ReactNode;
  /** Renders in apex destructive red — for "STREFA NIEBEZPIECZNA". */
  danger?: boolean;
};

export function SettingsSectionLabel({ children, danger }: SettingsSectionLabelProps) {
  return (
    <div
      className={cn(
        'mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.1em]',
        danger ? 'text-red-600' : 'text-apex-hint',
      )}
    >
      {children}
    </div>
  );
}
