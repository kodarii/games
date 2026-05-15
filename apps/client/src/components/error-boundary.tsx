import { type ErrorInfo, type ReactNode, Component } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  fallback: ReactNode | ((reset: () => void) => ReactNode);
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Global React render-error boundary.
 *
 * React 18 has no functional equivalent — class is the only path.
 * Mounted in `main.tsx` between `<QueryClientProvider>` and `<RouterProvider>`
 * so the fallback survives unmounting the entire router tree.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured log shape mirrors API logger event naming (e.g. 'igdb.breaker.open').
    // Single-user app — no Sentry/Axiom (SEC-V2-01 deferred). Future hook lands here.
    console.error('[ErrorBoundary]', {
      event: 'render.error.boundary',
      error,
      componentStack: info.componentStack,
    });
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallback } = this.props;
      return typeof fallback === 'function' ? fallback(this.reset) : fallback;
    }
    return this.props.children;
  }
}

export function AppErrorFallback(): ReactNode {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-white text-apex-ink">
      <h1 className="text-xl font-semibold">Coś poszło nie tak.</h1>
      <p className="max-w-md text-center text-sm text-apex-muted">
        Aplikacja napotkała niespodziewany błąd. Spróbuj odświeżyć stronę.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.assign('/')}>Załaduj ponownie</Button>
        <Button variant="outline" onClick={() => window.location.assign('/login')}>
          Wróć do logowania
        </Button>
      </div>
    </div>
  );
}
