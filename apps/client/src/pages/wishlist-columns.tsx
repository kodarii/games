import { Avatar } from '@/components/avatar';
import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMoveToCollectionMutation } from '@/lib/queries';
import type { Game } from '@/types';
import { createColumnHelper } from '@tanstack/react-table';

const columnHelper = createColumnHelper<Game>();

function MoveToCollectionButton({ externalId }: { externalId: string }) {
  const mut = useMoveToCollectionMutation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          variant="ghost-sm"
          disabled={mut.isPending}
          onClick={(e) => {
            e.stopPropagation();
            mut.mutate(externalId);
          }}
          aria-label="Move to collection"
        >
          <Icon.arrowRight size={15} />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>Move to collection</TooltipContent>
    </Tooltip>
  );
}

export const wishlistColumns = [
  columnHelper.accessor('title', {
    header: 'Title',
    cell: ({ row }) => (
      <div className="flex items-center gap-[11px]">
        <Avatar
          shape="rect"
          size={40}
          name={row.original.title}
          color={row.original.coverColor}
          src={row.original.coverImage}
        />
        <div>
          <div className="text-[13.5px] font-semibold leading-[1.35] text-apex-ink">
            {row.original.title}
          </div>
          <div className="text-[11.5px] leading-[1.35] text-apex-faint">
            {row.original.developer ?? ''}
          </div>
        </div>
      </div>
    ),
    meta: { minWidth: 260 },
  }),
  columnHelper.accessor('platform', {
    header: 'Platform',
    cell: ({ row }) => <span className="text-[13px] text-apex-ink">{row.original.platform}</span>,
    meta: { minWidth: 120 },
  }),
  columnHelper.accessor('releaseYear', {
    header: 'Release Year',
    cell: ({ row }) => (
      <span className="text-[13px] text-apex-ink">
        {row.original.releaseYear ?? <span className="text-apex-hint">—</span>}
      </span>
    ),
    meta: { minWidth: 110 },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: ({ row }) => <MoveToCollectionButton externalId={row.original.id} />,
    size: 48,
  }),
];
