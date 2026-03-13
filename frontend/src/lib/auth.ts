// docs/telegram/mini-app.md — Token Storage
// Access token: in-memory (React state/context)
// Refresh token: Telegram CloudStorage (persistent)

import { cloudStorageSet, cloudStorageGet, cloudStorageRemove } from './telegram';
import { api, setAccessToken, setTokenRefreshHandler } from './api';
import type { ApiResponse, AuthResponse } from '@/types';

export type { AuthResponse };

const REFRESH_TOKEN_KEY = 'refresh_token';

/** Authenticate via Telegram initData */
export async function authenticate(initData: string, startParam?: string): Promise<AuthResponse> {
  const response = await api.post<ApiResponse<AuthResponse>>(
    '/auth/telegram',
    { initData, startParam },
    { skipAuth: true },
  );
  const data = response.data;

  // Store tokens
  setAccessToken(data.accessToken);
  await saveRefreshToken(data.refreshToken);

  return data;
}

/** Refresh access token using stored refresh token.
 *  Returns full AuthResponse so the caller can restore session state
 *  without re-authenticating via initData (which may already be expired).
 */
export async function refreshAccessToken(): Promise<AuthResponse | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await api.post<ApiResponse<AuthResponse>>(
      '/auth/refresh',
      { refreshToken },
      { skipAuth: true },
    );
    const data = response.data;

    setAccessToken(data.accessToken);
    await saveRefreshToken(data.refreshToken);

    return data;
  } catch {
    // Refresh failed — clear tokens
    await clearTokens();
    return null;
  }
}

/** Logout */
export async function logout(): Promise<void> {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken });
    }
  } catch {
    // Ignore errors on logout
  }
  await clearTokens();
}

/** Save refresh token to Telegram CloudStorage */
async function saveRefreshToken(token: string): Promise<void> {
  try {
    await cloudStorageSet(REFRESH_TOKEN_KEY, token);
  } catch {
    // Fallback: sessionStorage (less reliable)
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  }
}

/** Get refresh token from Telegram CloudStorage */
async function getRefreshToken(): Promise<string | undefined> {
  try {
    return await cloudStorageGet(REFRESH_TOKEN_KEY);
  } catch {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? undefined;
  }
}

/** Clear all tokens */
async function clearTokens(): Promise<void> {
  setAccessToken(null);
  try {
    await cloudStorageRemove(REFRESH_TOKEN_KEY);
  } catch {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

// Register the token refresh handler for automatic 401 retry
setTokenRefreshHandler(refreshAccessToken);
