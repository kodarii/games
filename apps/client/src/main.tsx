import { AppLayout } from '@/components/layout/app-layout';
import { GamesPage } from '@/pages/games';
import { GameNewPage } from '@/pages/game-new';
import { GameEditPage } from '@/pages/game-edit';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/games" replace /> },
      { path: 'games', element: <GamesPage /> },
      { path: 'games/new', element: <GameNewPage /> },
      { path: 'games/:id/edit', element: <GameEditPage /> },
      { path: 'settings', element: <Placeholder title="Settings" /> },
      { path: 'support', element: <Placeholder title="Support" /> },
    ],
  },
]);

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-apex-muted">
      {title} — coming soon
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
