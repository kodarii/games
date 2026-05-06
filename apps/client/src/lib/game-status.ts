import type { StatusVariant } from '@/components/status-badge';
import type { GameStatus } from '@/types';

export function statusFor(s: GameStatus): { variant: StatusVariant; label: string } {
  switch (s) {
    case 'Playing':
      return { variant: 'progress', label: 'Playing' };
    case 'Backlog':
      return { variant: 'pending', label: 'Backlog' };
    case 'Completed':
      return { variant: 'done', label: 'Completed' };
    case 'Dropped':
      return { variant: 'inactive', label: 'Dropped' };
  }
}
