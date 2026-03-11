import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';

import { App } from '@/App';
import { AuthProvider } from '@/hooks/useAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initTelegramApp } from '@/lib/telegram';
import { loadMessages, detectLocale } from '@/lib/i18n';

import '@/styles/globals.css';

// Initialize Telegram WebApp
initTelegramApp();

// Query client with sensible defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

async function bootstrap() {
  // Detect locale and load messages
  const locale = detectLocale();
  const messages = await loadMessages(locale);

  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

  root.render(
    <React.StrictMode>
      <IntlProvider
        locale={locale}
        messages={messages}
        defaultLocale="uk"
        onError={() => {
          // Suppress missing translation warnings in dev
        }}
      >
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </IntlProvider>
    </React.StrictMode>,
  );
}

bootstrap();
