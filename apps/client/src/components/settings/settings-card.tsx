import { cn } from '@/lib/utils';

type SettingsCardProps = {
  title?: string;
  description?: string;
  danger?: boolean;
  children: React.ReactNode;
};

export function SettingsCard({ title, description, danger, children }: SettingsCardProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[10px] border bg-white',
        danger ? 'border-red-200' : 'border-apex-line-4',
      )}
    >
      {(title || description) && (
        <header className="border-b border-apex-line-4 px-4 py-3">
          {title && (
            <h3
              className={cn('text-[13px] font-semibold', danger ? 'text-red-700' : 'text-apex-ink')}
            >
              {title}
            </h3>
          )}
          {description && <p className="mt-1 text-[12.5px] text-apex-muted">{description}</p>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}
