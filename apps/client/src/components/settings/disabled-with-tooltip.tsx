import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type DisabledWithTooltipProps = {
  /** Tooltip / toast copy. Defaults to "Wkrótce". */
  tooltip?: string;
  /** Visual content of the disabled button. */
  children: React.ReactNode;
  /** Optional override for the button variant (defaults to ghost). */
  variant?: 'ghost' | 'outline';
};

const BASE =
  'inline-flex h-8 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-[12.5px] font-medium opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const VARIANTS = {
  ghost: 'text-apex-ink hover:bg-transparent',
  outline: 'border border-apex-line-4 bg-white text-apex-ink',
} as const;

/**
 * Visually-disabled button via `aria-disabled="true"` + `tabIndex={0}` so the
 * trigger still receives pointer + focus events (native `disabled` swallows
 * them and kills Radix Tooltip). Click/tap fires `toast.info(tooltip)` as a
 * touch fallback for devices without hover.
 */
export function DisabledWithTooltip({
  tooltip = 'Wkrótce',
  children,
  variant = 'ghost',
}: DisabledWithTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          onClick={() => toast.info(tooltip)}
          className={cn(BASE, VARIANTS[variant], 'cursor-not-allowed')}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
