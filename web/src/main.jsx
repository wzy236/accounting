import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './app.css';
import { theme } from './theme.js';
import App from './App.jsx';
import { SupabaseProvider } from './lib/SupabaseContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <ModalsProvider>
        <Notifications position="bottom-center" limit={3} containerWidth={420} />
        <HashRouter>
          <SupabaseProvider>
            <App />
          </SupabaseProvider>
        </HashRouter>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>
);
