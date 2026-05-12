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
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { revokeSessions, useSession } from '@/lib/auth-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function AccountSessionsCard() {
  const { refetch: refetchSession } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const onConfirm = async () => {
    setIsPending(true);
    try {
      await revokeSessions();
      await refetchSession();
      qc.removeQueries({ queryKey: ['games'] });
      navigate('/login', { replace: true });
    } catch {
      setIsPending(false);
      // On failure leave the user on the page; better-auth surfaces error via toast/console.
      // We intentionally DO NOT navigate on failure (defensive: a partial revoke is still a "stay" state).
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-apex-ink">Bezpieczeństwo</CardTitle>
        <CardDescription className="text-sm text-apex-muted">
          Wyloguj się ze wszystkich aktywnych sesji na innych urządzeniach i przeglądarkach.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isPending}>
              Wyloguj wszystkie sesje
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Wylogować wszystkie sesje?</AlertDialogTitle>
              <AlertDialogDescription>
                Zostaniesz przekierowany na ekran logowania. Twoja kolekcja pozostanie nietknięta.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={onConfirm}
                className={buttonVariants({ variant: 'destructive' })}
              >
                Wyloguj wszystkie
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
