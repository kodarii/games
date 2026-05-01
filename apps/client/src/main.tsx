import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { AuthLayout } from '@/components/layout/auth-layout';
import { queryClient } from '@/lib/query-client';
import { DataPage } from '@/pages/data';
import { DictionariesPage } from '@/pages/dictionaries';
import { DictionariesPlatformsPage } from '@/pages/dictionaries-platforms';
import { GameEditPage } from '@/pages/game-edit';
import { GameNewPage } from '@/pages/game-new';
import { GameViewPage } from '@/pages/game-view';
import { GamesPage } from '@/pages/games';
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom';
import './index.css';

const router = createBrowserRouter(
  [
    {
      element: <AuthLayout />,
      children: [
        { path: '/login', element: <LoginPage /> },
        { path: '/register', element: <RegisterPage /> },
      ],
    },
    {
      element: <ProtectedRoute />,
      children: [
        {
          path: '/',
          element: <AppLayout />,
          children: [
            { index: true, element: <Navigate to="/games" replace /> },
            { path: 'games', element: <GamesPage /> },
            { path: 'games/new', element: <GameNewPage /> },
            { path: 'games/:id', element: <GameViewPage /> },
            { path: 'games/:id/edit', element: <GameEditPage /> },
            { path: 'settings', element: <Placeholder title="Settings" /> },
            { path: 'support', element: <Placeholder title="Support" /> },
            { path: 'data', element: <DataPage /> },
            { path: 'dictionaries', element: <DictionariesPage /> },
            { path: 'dictionaries/platforms', element: <DictionariesPlatformsPage /> },
          ],
        },
      ],
    },
  ],
  {},
);

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-apex-muted">
      {title} — coming soon
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
