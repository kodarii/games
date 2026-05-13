import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameTitle: string;
  isDeleting: boolean;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  gameTitle,
  isDeleting,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-x-3 top-3 z-50 max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.22)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top sm:inset-x-auto sm:top-1/2 sm:left-1/2 sm:w-[460px] sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[14px] sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center gap-3 border-b border-apex-line-1 px-[22px] pb-[16px] pt-[18px]">
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] bg-[#dc2626]">
              <Icon.trash size={16} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialog.Title className="truncate text-[15px] font-bold tracking-tight text-apex-ink">
                Delete "{gameTitle}"?
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-px text-[11.5px] text-apex-muted">
                This action cannot be undone.
              </AlertDialog.Description>
            </div>
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                aria-label="Close"
                className="flex h-[28px] w-[28px] items-center justify-center rounded-md text-apex-muted hover:bg-apex-line-1"
              >
                <CloseIcon />
              </button>
            </AlertDialog.Cancel>
          </div>

          <div className="flex justify-end gap-2 bg-[#fafafa] px-[22px] py-[14px]">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" size="sm" disabled={isDeleting}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
