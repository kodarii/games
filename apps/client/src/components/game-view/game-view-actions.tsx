import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface GameViewActionsProps {
  kind: 'owned' | 'wishlist';
  isMovePending: boolean;
  onMove: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Action cluster on GameViewPage top bar:
 * - Wishlist games: "Move to collection" CTA + dropdown.
 * - Owned games: dropdown only (Edit / Delete).
 *
 * Replaces the hand-rolled ActionsDropdown (game-view.tsx:75-169) with Radix
 * DropdownMenu — keyboard nav (Tab/Arrow/Escape), click-outside, focus return,
 * role="menu" handled by Radix.
 */
export function GameViewActions({
  kind,
  isMovePending,
  onMove,
  onEdit,
  onDelete,
}: GameViewActionsProps) {
  return (
    <>
      {kind === 'wishlist' && (
        <Button
          variant="primary"
          size="sm"
          onClick={onMove}
          disabled={isMovePending}
        >
          <Icon.arrowRight size={13} />
          {isMovePending ? 'Moving…' : 'Move to collection'}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Actions"
            data-testid="game-view-actions-trigger"
            className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-apex-line-4 bg-white transition-colors hover:bg-apex-surface-hover data-[state=open]:bg-apex-surface-hover"
          >
            <Icon.more size={15} className="text-apex-ink-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="min-w-[160px]"
        >
          <DropdownMenuItem onSelect={onEdit}>
            <Icon.edit size={13} className="mr-2" />
            Edit game
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-[#e63946] focus:bg-[#fff5f5] focus:text-[#e63946]"
          >
            <Icon.trash size={13} className="mr-2" />
            Delete game
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
