import { useEffect, useState } from 'react';
import { bundledBuild, fetchDeployedVersion, type DeployedVersion } from '@/lib/version';

/** Jak często widoczna karta pyta serwer, którą paczkę teraz wydaje. */
const POLL_MS = 5 * 60 * 1000;

/**
 * Wykrywa, że w czasie, gdy ta karta była otwarta, wdrożono nowszą wersję.
 *
 * Wyłączone na serwerze deweloperskim i dla buildów lokalnych (`local-…`): tam `version.json`
 * nie jest publikowany, więc rozjazd nic by nie znaczył. Karta w tle nie pyta; powrót do karty
 * (np. zostawionej na noc) sprawdza od razu.
 */
export function useVersionCheck() {
  const enabled = !import.meta.env.DEV && bundledBuild !== '' && !bundledBuild.startsWith('local-');
  const [deployed, setDeployed] = useState<DeployedVersion | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      fetchDeployedVersion().then((v) => {
        if (alive && v) setDeployed(v);
      });
    };
    check();
    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [enabled]);

  return {
    updateAvailable: enabled && deployed !== null && deployed.build !== bundledBuild,
    deployedVersion: deployed?.version ?? null,
    deployedBuild: deployed?.build ?? null,
  };
}
