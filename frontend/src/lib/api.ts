// docs/telegram/mini-app.md — API client (fetch-based)
// docs/api/authentication.md — JWT Bearer auth

const API_BASE = '/api/v1';
const TOKEN_REFRESH_BUFFER_MS = 30_000;

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface ApiError {
  statusCode: number;
  errorCode: string;
  message: string;
}

interface ApiErrorEnvelope {
  success?: false;
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiRequestError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

/** Token refresh handler — will be set by auth module.
 *  Returns either a string (access token) or an object with accessToken property, or null on failure.
 */
let onTokenExpired: (() => Promise<string | { accessToken: string } | null>) | null = null;

export function setTokenRefreshHandler(
  handler: () => Promise<string | { accessToken: string } | null>,
): void {
  onTokenExpired = handler;
}

function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded)) as { exp?: number };

    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function shouldRefreshToken(token: string | null): boolean {
  if (!token) return true;

  const expiry = getTokenExpiry(token);
  if (!expiry) return false;

  return expiry - Date.now() <= TOKEN_REFRESH_BUFFER_MS;
}

function extractAccessToken(refreshResult: string | { accessToken: string } | null): string | null {
  if (typeof refreshResult === 'string') {
    return refreshResult;
  }

  return refreshResult?.accessToken || null;
}

async function ensureValidAccessToken(): Promise<string | null> {
  if (!onTokenExpired) return accessToken;
  if (!shouldRefreshToken(accessToken)) return accessToken;

  if (!refreshPromise) {
    refreshPromise = onTokenExpired()
      .then((refreshResult) => {
        const newToken = extractAccessToken(refreshResult);

        accessToken = newToken;
        return newToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (!skipAuth) {
    const ensuredToken = await ensureValidAccessToken();
    if (ensuredToken) {
      accessToken = ensuredToken;
    }
  }

  if (!skipAuth && accessToken) {
    reqHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  // If 401, try to refresh token once
  if (response.status === 401 && !skipAuth && onTokenExpired) {
    const refreshResult = await onTokenExpired();
    const newToken =
      typeof refreshResult === 'string' ? refreshResult : (refreshResult?.accessToken ?? null);
    if (newToken) {
      accessToken = newToken;
      reqHeaders['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!response.ok) {
    let error: ApiError;
    try {
      const payload = (await response.json()) as ApiError | ApiErrorEnvelope;
      const envelopeError = 'error' in payload ? payload.error : undefined;
      error = {
        statusCode:
          'statusCode' in payload && typeof payload.statusCode === 'number'
            ? payload.statusCode
            : response.status,
        errorCode:
          'errorCode' in payload && typeof payload.errorCode === 'string'
            ? payload.errorCode
            : envelopeError?.code || 'UNKNOWN',
        message:
          'message' in payload && typeof payload.message === 'string'
            ? payload.message
            : envelopeError?.message || response.statusText,
      };
    } catch {
      error = {
        statusCode: response.status,
        errorCode: 'UNKNOWN',
        message: response.statusText,
      };
    }
    throw new ApiRequestError(error.statusCode, error.errorCode, error.message);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ─── Convenience methods ───

export const api = {
  get: <T>(endpoint: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...opts, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...opts, method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...opts, method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...opts, method: 'PATCH', body }),

  delete: <T>(endpoint: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...opts, method: 'DELETE' }),

  /** Upload a file via multipart/form-data (browser sets Content-Type with boundary) */
  upload: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    const token = await ensureValidAccessToken();
    if (token) accessToken = token;

    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    let response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (response.status === 401 && onTokenExpired) {
      const refreshResult = await onTokenExpired();
      const newToken =
        typeof refreshResult === 'string' ? refreshResult : (refreshResult?.accessToken ?? null);
      if (newToken) {
        accessToken = newToken;
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers,
          body: formData,
        });
      }
    }

    if (!response.ok) {
      let statusCode = response.status;
      let errorCode = 'UNKNOWN';
      let message = response.statusText;
      try {
        const payload = await response.json();
        statusCode = payload.statusCode ?? statusCode;
        errorCode = payload.errorCode ?? payload.error?.code ?? errorCode;
        message = payload.message ?? payload.error?.message ?? message;
      } catch {
        /* ignore */
      }
      throw new ApiRequestError(statusCode, errorCode, message);
    }

    return response.json();
  },
};
