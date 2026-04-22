import { AppLayout } from '@/components/layout/app-layout';
import { GamesPage } from '@/pages/games';
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
