/**
 * Wersja aplikacji.
 *
 * `__APP_BUILD__` jest zamrożony w paczce w chwili budowania, a `/version.json` na serwerze
 * mówi, co jest wdrożone teraz. Porównujemy BUILD, nie numer wersji — poprawka wdrożona bez
 * podbicia numeru też wymaga przeładowania.
 */
export interface DeployedVersion {
  version: string;
  build: string;
  date?: string;
}

export const appVersion: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
export const bundledBuild: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';

export async function fetchDeployedVersion(): Promise<DeployedVersion | null> {
  try {
    // `no-store` + parametr: serwer i przeglądarka nie mogą oddać zbuforowanej kopii.
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<DeployedVersion>;
    if (typeof data.build !== 'string' || typeof data.version !== 'string') return null;
    return { version: data.version, build: data.build, date: data.date };
  } catch {
    return null;
  }
}
