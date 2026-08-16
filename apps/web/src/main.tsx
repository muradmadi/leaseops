import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App.tsx';
import { queryClient } from './lib/query-client';
// Inter, self-hosted. Previously two <link>s to fonts.googleapis.com, which made
// every page load reach a third party and forced the CSP to allow it — on a
// self-hosted app whose whole point is that the data stays yours. One variable
// file covers weights 100–900; `wght` rather than the package root skips the
// italic and optical-size axes the design never uses.
import '@fontsource-variable/inter/wght.css';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
