import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';

interface Props {
  totalCount?: number;
  onReset: () => void;
}

export function GamesEmptyState({ totalCount, onReset }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <Icon.search size={32} className="text-apex-muted" />
      <div className="text-[15px] font-semibold text-apex-ink">No games match these filters</div>
      <div className="text-[13px] text-apex-muted">
        {totalCount != null ? `Showing 0 of ${totalCount} games` : 'Try adjusting your filters'}
      </div>
      <Button variant="primary" size="sm" onClick={onReset} className="mt-2">
        Reset filters
      </Button>
    </div>
  );
}
