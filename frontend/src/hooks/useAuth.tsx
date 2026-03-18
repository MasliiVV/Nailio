import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authenticate, logout as logoutApi, refreshAccessToken } from '@/lib/auth';
import { getInitData, getStartParam, getTelegram, isTelegramEnv } from '@/lib/telegram';
import { prefetchMasterData, prefetchClientData } from '@/lib/prefetch';
import type { AuthResponse, Profile, Tenant, UserRole } from '@/types';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  role: UserRole | null;
  needsOnboarding: boolean;
  profile: Profile | null;
  tenant: Tenant | null;
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (profile: Profile) => void;
  updateTenant: (tenant: Tenant) => void;
  setOnboardingComplete: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    error: null,
    role: null,
    needsOnboarding: false,
    profile: null,
    tenant: null,
  });

  const handleAuthResponse = useCallback((data: AuthResponse) => {
    // Start prefetching data BEFORE React re-renders — saves ~200-500ms
    if (!data.needsOnboarding) {
      if (data.role === 'master') prefetchMasterData();
      else if (data.role === 'client') prefetchClientData();
    }

    setState({
      isLoading: false,
      isAuthenticated: true,
      error: null,
      role: data.role,
      needsOnboarding: data.needsOnboarding,
      profile: data.profile,
      tenant: data.tenant,
    });
  }, []);

  const login = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const initData = getInitData();
      if (!initData) {
        throw new Error(
          'Відкрийте додаток через кнопку меню в Telegram-боті, а не як звичайний сайт.',
        );
      }

      const startParam = getStartParam();
      const data = await authenticate(initData, startParam || undefined);
      handleAuthResponse(data);
    } catch (err) {
      // Try to restore session via refresh token
      try {
        const refreshedData = await refreshAccessToken();
        if (refreshedData) {
          // Refresh succeeded — use the full AuthResponse directly
          // (no need to re-authenticate with initData which may be expired)
          handleAuthResponse(refreshedData);
          return;
        }
      } catch {
        // Refresh also failed
      }

      setState({
        isLoading: false,
        isAuthenticated: false,
        error: err instanceof Error ? err.message : 'Authentication failed',
        role: null,
        needsOnboarding: false,
        profile: null,
        tenant: null,
      });
    }
  }, [handleAuthResponse]);

  const logout = useCallback(async () => {
    await logoutApi();
    setState({
      isLoading: false,
      isAuthenticated: false,
      error: null,
      role: null,
      needsOnboarding: false,
      profile: null,
      tenant: null,
    });
  }, []);

  const updateProfile = useCallback((profile: Profile) => {
    setState((prev) => ({ ...prev, profile }));
  }, []);

  const updateTenant = useCallback((tenant: Tenant) => {
    setState((prev) => ({ ...prev, tenant }));
  }, []);

  const setOnboardingComplete = useCallback(() => {
    setState((prev) => ({ ...prev, needsOnboarding: false }));
  }, []);

  // Auto-authenticate on mount
  useEffect(() => {
    if (isTelegramEnv()) {
      login();
    } else {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Цей додаток працює тільки всередині Telegram Mini App.',
      }));
    }
  }, [login]);

  // Setup Telegram back button close behavior
  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;

    const shouldCloseMiniApp = (pathname: string) => {
      if (pathname === '/onboarding' || pathname === '/master' || pathname === '/client') {
        return true;
      }

      return false;
    };

    const handleBack = () => {
      if (shouldCloseMiniApp(window.location.pathname)) {
        tg.close();
      } else {
        window.history.back();
      }
    };

    tg.BackButton.onClick(handleBack);
    return () => {
      tg.BackButton.offClick(handleBack);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      updateProfile,
      updateTenant,
      setOnboardingComplete,
    }),
    [state, login, logout, updateProfile, updateTenant, setOnboardingComplete],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
