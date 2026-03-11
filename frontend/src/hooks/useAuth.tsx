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
        throw new Error('No Telegram initData available');
      }

      const startParam = getStartParam();
      const data = await authenticate(initData, startParam || undefined);
      handleAuthResponse(data);
    } catch (err) {
      // Try to restore session via refresh token
      try {
        await refreshAccessToken();
        // If refresh succeeds, re-authenticate to get full profile
        const initData = getInitData();
        if (initData) {
          const data = await authenticate(initData, getStartParam() || undefined);
          handleAuthResponse(data);
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
      // Dev mode — skip auth
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Not running inside Telegram',
      }));
    }
  }, [login]);

  // Apply tenant branding
  useEffect(() => {
    if (!state.tenant?.branding) return;

    const root = document.documentElement;
    const { primaryColor, secondaryColor } = state.tenant.branding;

    if (primaryColor) {
      root.style.setProperty('--tenant-primary', primaryColor);
    }
    if (secondaryColor) {
      root.style.setProperty('--tenant-secondary', secondaryColor);
    }
  }, [state.tenant]);

  // Setup Telegram back button close behavior
  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;

    // Close the Mini App on back button if at root
    const handleBack = () => {
      if (window.history.length <= 1) {
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
