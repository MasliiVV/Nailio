import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Layouts (keep eager — always needed)
import { MasterLayout } from '@/layouts/MasterLayout';
import { ClientLayout } from '@/layouts/ClientLayout';

// Eager-loaded landing pages (no extra round-trip)
import { ClientHomePage } from '@/pages/client/HomePage';
import { CalendarPage } from '@/pages/master/CalendarPage';

// Lazy-loaded pages for code splitting
const BookingPage = lazy(() =>
  import('@/pages/client/BookingPage').then((m) => ({ default: m.BookingPage })),
);
const MyBookingsPage = lazy(() =>
  import('@/pages/client/MyBookingsPage').then((m) => ({ default: m.MyBookingsPage })),
);
const ClientProfilePage = lazy(() =>
  import('@/pages/client/ProfilePage').then((m) => ({ default: m.ClientProfilePage })),
);
const ClientOnboardingPage = lazy(() =>
  import('@/pages/client/OnboardingPage').then((m) => ({ default: m.ClientOnboardingPage })),
);
const ClientsPage = lazy(() =>
  import('@/pages/master/ClientsPage').then((m) => ({ default: m.ClientsPage })),
);
const ClientDetailPage = lazy(() =>
  import('@/pages/master/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })),
);
const ServicesPage = lazy(() =>
  import('@/pages/master/ServicesPage').then((m) => ({ default: m.ServicesPage })),
);
const SchedulePage = lazy(() =>
  import('@/pages/master/SchedulePage').then((m) => ({ default: m.SchedulePage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/master/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AnalyticsPage = lazy(() =>
  import('@/pages/master/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const FinancePage = lazy(() =>
  import('@/pages/master/FinancePage').then((m) => ({ default: m.FinancePage })),
);
const SubscriptionPage = lazy(() =>
  import('@/pages/master/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })),
);

const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminTenantPage = lazy(() =>
  import('@/pages/admin/AdminTenantPage').then((m) => ({ default: m.AdminTenantPage })),
);

const OnboardingWizard = lazy(() =>
  import('@/pages/onboarding/OnboardingWizard').then((m) => ({ default: m.OnboardingWizard })),
);

// Lazy suspense fallback
function PageLoader() {
  return (
    <div className="loading-screen" style={{ minHeight: '40vh' }}>
      <div className="spinner" />
    </div>
  );
}

// Loading screen
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="spinner spinner-lg" />
      <p className="loading-screen__text">Завантаження...</p>
    </div>
  );
}

// Auth error screen
function AuthErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  const helpText =
    error.includes('Telegram') || error.includes('боті')
      ? 'Відкрийте @nailioapp_bot у Telegram і запустіть Mini App через кнопку меню.'
      : null;

  return (
    <div className="loading-screen">
      <ShieldAlert size={48} color="var(--color-destructive)" />
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>Помилка авторизації</h2>
      <p className="text-secondary">{error}</p>
      {helpText ? <p className="text-secondary">{helpText}</p> : null}
      <button
        className="touchable"
        style={{
          padding: '12px 24px',
          background: 'var(--color-primary)',
          color: 'var(--color-primary-text)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
          fontSize: 15,
        }}
        onClick={onRetry}
      >
        Спробувати ще
      </button>
    </div>
  );
}

export function App() {
  const { isLoading, isAuthenticated, error, role, needsOnboarding, login } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated || error) {
    return <AuthErrorScreen error={error || 'Не вдалося увійти'} onRetry={login} />;
  }

  // Master needs onboarding — redirect to wizard
  if (role === 'master' && needsOnboarding) {
    return (
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/onboarding/*" element={<OnboardingWizard />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  // Client needs onboarding — redirect to profile setup
  if (role === 'client' && needsOnboarding) {
    return (
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/client/onboarding" element={<ClientOnboardingPage />} />
            <Route path="*" element={<Navigate to="/client/onboarding" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {role === 'master' ? (
            <>
              <Route path="/master" element={<MasterLayout />}>
                <Route index element={<CalendarPage />} />
                <Route path="clients" element={<ClientsPage />} />
                <Route path="clients/:id" element={<ClientDetailPage />} />
                <Route path="services" element={<ServicesPage />} />
                <Route path="schedule" element={<SchedulePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="finance" element={<FinancePage />} />
                <Route path="subscription" element={<SubscriptionPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/master" replace />} />
            </>
          ) : role === 'platform_admin' ? (
            <>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/tenants/:id" element={<AdminTenantPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </>
          ) : (
            <>
              <Route path="/client" element={<ClientLayout />}>
                <Route index element={<ClientHomePage />} />
                <Route path="book/:serviceId" element={<BookingPage />} />
                <Route path="bookings" element={<MyBookingsPage />} />
                <Route path="profile" element={<ClientProfilePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/client" replace />} />
            </>
          )}
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
