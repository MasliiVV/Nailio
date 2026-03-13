import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Layouts
import { MasterLayout } from '@/layouts/MasterLayout';
import { ClientLayout } from '@/layouts/ClientLayout';

// Client pages
import { ClientHomePage } from '@/pages/client/HomePage';
import { BookingPage } from '@/pages/client/BookingPage';
import { MyBookingsPage } from '@/pages/client/MyBookingsPage';
import { ClientProfilePage } from '@/pages/client/ProfilePage';
import { ClientOnboardingPage } from '@/pages/client/OnboardingPage';

// Master pages
import { DashboardPage } from '@/pages/master/DashboardPage';
import { CalendarPage } from '@/pages/master/CalendarPage';
import { ClientsPage } from '@/pages/master/ClientsPage';
import { ClientDetailPage } from '@/pages/master/ClientDetailPage';
import { ServicesPage } from '@/pages/master/ServicesPage';
import { SchedulePage } from '@/pages/master/SchedulePage';
import { SettingsPage } from '@/pages/master/SettingsPage';
import { AnalyticsPage } from '@/pages/master/AnalyticsPage';
import { FinancePage } from '@/pages/master/FinancePage';
import { SubscriptionPage } from '@/pages/master/SubscriptionPage';

// Admin pages
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminTenantPage } from '@/pages/admin/AdminTenantPage';

// Onboarding
import { OnboardingWizard } from '@/pages/onboarding/OnboardingWizard';

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
        <Routes>
          <Route path="/onboarding/*" element={<OnboardingWizard />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Client needs onboarding — redirect to profile setup
  if (role === 'client' && needsOnboarding) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/client/onboarding" element={<ClientOnboardingPage />} />
          <Route path="*" element={<Navigate to="/client/onboarding" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {role === 'master' ? (
          <>
            <Route path="/master" element={<MasterLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="calendar" element={<CalendarPage />} />
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
    </BrowserRouter>
  );
}
