import { basePath } from '@/lib/apiBase';

/**
 * Klient API z obsługą sesji.
 *
 * Token dostępu żyje 1h. Wcześniej frontend nigdy go nie odświeżał, więc po godzinie
 * pracy każdy zapis kończył się 401, a wpis istniał tylko w pamięci karty — po
 * przeładowaniu znikał. Teraz:
 *  - przy 401 robimy jeden wspólny (single-flight) refresh i ponawiamy żądanie,
 *  - sesja jest odświeżana proaktywnie (co 30 min i po powrocie do karty),
 *  - gdy refresh się nie uda, emitujemy zdarzenie `wtt:session-expired`
 *    (UI pokazuje logowanie bez odmontowania aplikacji — dane zostają).
 */

export class SessionExpiredError extends Error {
  constructor() {
    super('Sesja wygasła — zaloguj się ponownie');
    this.name = 'SessionExpiredError';
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const SESSION_EXPIRED_EVENT = 'wtt:session-expired';
export const SESSION_RESTORED_EVENT = 'wtt:session-restored';

const AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
];

let refreshPromise: Promise<boolean> | null = null;
let lastRefreshAt = Date.now();
let sessionExpired = false;

export function isSessionExpired() {
  return sessionExpired;
}

/** Jeden wspólny refresh dla wszystkich równoległych żądań. */
export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${basePath}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    })
      .then((r) => {
        if (r.ok) lastRefreshAt = Date.now();
        return r.ok;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export function markSessionExpired() {
  if (sessionExpired) return;
  sessionExpired = true;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

export function markSessionRestored() {
  sessionExpired = false;
  lastRefreshAt = Date.now();
  window.dispatchEvent(new CustomEvent(SESSION_RESTORED_EVENT));
}

function toUrl(path: string) {
  return path.startsWith('http') ? path : `${basePath}${path}`;
}

/**
 * fetch z credentials, automatycznym refreshem przy 401 i jednym ponowieniem.
 * Zwraca Response (także dla błędów innych niż 401 — wywołujący sprawdza `ok`).
 * Rzuca SessionExpiredError, gdy sesji nie da się odnowić.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = toUrl(path);
  const opts: RequestInit = { credentials: 'include', cache: 'no-store', ...init };
  const res = await fetch(url, opts);
  if (res.status !== 401 || AUTH_PATHS.some((p) => path.startsWith(p))) return res;

  const refreshed = await refreshSession();
  if (!refreshed) {
    markSessionExpired();
    throw new SessionExpiredError();
  }
  const retry = await fetch(url, opts);
  if (retry.status === 401) {
    markSessionExpired();
    throw new SessionExpiredError();
  }
  return retry;
}

/** apiFetch + parsowanie JSON + błąd dla statusów != 2xx. */
export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data && (data.error || data.details)) || `Błąd serwera (${res.status})`,
      res.status,
    );
  }
  return data as T;
}

const KEEPALIVE_MS = 30 * 60 * 1000;
let keepAliveStarted = false;

/** Proaktywne odświeżanie sesji, żeby token nie wygasał w trakcie pisania. */
export function startSessionKeepAlive() {
  if (keepAliveStarted || typeof window === 'undefined') return;
  keepAliveStarted = true;
  const tick = async () => {
    if (sessionExpired || document.visibilityState !== 'visible') return;
    if (Date.now() - lastRefreshAt < KEEPALIVE_MS) return;
    const ok = await refreshSession();
    if (!ok) markSessionExpired();
  };
  window.setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', tick);
}
