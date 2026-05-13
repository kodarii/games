import { SettingsRow } from '@/components/settings/settings-row';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { revokeOtherSessions } from '@/lib/auth-client';
import { useState } from 'react';
import { toast } from 'sonner';

export function SignOutOtherDevicesRow() {
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  const onConfirm = async () => {
    setIsPending(true);
    const { error } = await revokeOtherSessions();
    setIsPending(false);
    if (error) {
      toast.error('Nie udało się wylogować innych urządzeń.');
      return;
    }
    setOpen(false);
    toast.success('Wylogowano inne urządzenia.');
  };

  return (
    <SettingsRow
      label="Wyloguj inne urządzenia"
      desc="Zakończ aktywne sesje na innych przeglądarkach i urządzeniach."
    >
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            Wyloguj
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wylogować inne urządzenia?</AlertDialogTitle>
            <AlertDialogDescription>
              Pozostaniesz zalogowany na tym urządzeniu. Inne sesje zostaną zakończone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              className={buttonVariants({ variant: 'primary' })}
            >
              Wyloguj inne
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsRow>
  );
}
