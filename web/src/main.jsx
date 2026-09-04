import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './style.css';
import App from './App.jsx';
import { SupabaseProvider } from './lib/SupabaseContext.jsx';
import { ToastProvider } from './lib/ToastContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <SupabaseProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </SupabaseProvider>
    </HashRouter>
  </StrictMode>
);
