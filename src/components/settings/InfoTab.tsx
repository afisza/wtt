import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import SettingsSection from './SettingsSection';

interface TableInfo {
  name: string;
  rows: number;
  size: string;
}

interface DbInfo {
  size: string;
  tables: TableInfo[];
  limitedPrivileges?: boolean;
  message?: string;
}

interface MigrateResult {
  success: boolean;
  message?: string;
  migrated?: { days: number; tasks: number };
  details?: {
    clientsProcessed: number;
    monthsProcessed: number;
    daysWithTasks: number;
    daysSkipped: number;
    tasksAdded: number;
    tasksUpdated: number;
    tasksDeleted: number;
    errors: string[];
    errorsCount: number;
  };
  debug?: unknown;
}

function ResultBanner({ success, children }: { success: boolean; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'flex gap-3 rounded-lg border p-4 text-sm',
        success
          ? 'border-status-done/40 bg-status-done/10'
          : 'border-destructive/40 bg-destructive/10',
      )}
    >
      {success ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-status-done" />
      ) : (
        <XCircle className="h-5 w-5 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function InfoTab() {
  const { showToast } = useToast();
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [initLoading, setInitLoading] = useState(false);
  const [initResult, setInitResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null);

  const loadDatabaseInfo = useCallback(async () => {
    setInfoLoading(true);
    try {
      const response = await apiFetch('/api/settings/db-info');
      setDbInfo(response.ok ? await response.json() : null);
    } catch {
      setDbInfo(null);
    } finally {
      setInfoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatabaseInfo();
  }, [loadDatabaseInfo]);

  const initializeDatabase = async () => {
    setInitLoading(true);
    setInitResult(null);
    try {
      const response = await apiFetch('/api/settings/db-init', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      setInitResult(
        response.ok
          ? { success: true, message: data.message }
          : { success: false, message: data.error || 'Nie udało się utworzyć tabel' },
      );
      if (response.ok) loadDatabaseInfo();
    } catch {
      setInitResult({ success: false, message: 'Nie udało się utworzyć tabel' });
    } finally {
      setInitLoading(false);
    }
  };

  const handleMigrate = async () => {
    setMigrateLoading(true);
    setMigrateResult(null);
    try {
      const response = await apiFetch('/api/settings/migrate-json-to-mysql', { method: 'POST' });
      const data: MigrateResult = await response.json();
      setMigrateResult(data);
      if (data.success) loadDatabaseInfo();
    } catch (error) {
      setMigrateResult({ success: false, message: (error as Error).message || 'Błąd migracji' });
      showToast('Migracja nie powiodła się', 'error');
    } finally {
      setMigrateLoading(false);
    }
  };

  const d = migrateResult?.details;

  return (
    <SettingsSection
      title="Baza danych"
      description="Rozmiar, tabele i narzędzia serwisowe."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadDatabaseInfo}
            disabled={infoLoading}
            aria-label="Odśwież"
          >
            <RotateCw className={cn('h-3.5 w-3.5', infoLoading && 'animate-spin')} />
            Odśwież
          </Button>
          <Button variant="outline" size="sm" onClick={initializeDatabase} disabled={initLoading}>
            {initLoading ? 'Tworzenie…' : 'Utwórz brakujące tabele'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={migrateLoading}>
                {migrateLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {migrateLoading ? 'Migrowanie…' : 'Migruj JSON → MySQL'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Przenieść dane z JSON do MySQL?</AlertDialogTitle>
                <AlertDialogDescription>
                  Zadania z pliku data/work-time.json zostaną dopisane lub zaktualizowane w bazie.
                  Może to potrwać chwilę.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anuluj</AlertDialogCancel>
                <AlertDialogAction onClick={handleMigrate}>Migruj dane</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      }
    >
      {migrateResult && (
        <ResultBanner success={migrateResult.success}>
          <p className="font-medium">{migrateResult.message}</p>
          {(migrateResult.migrated || d) && (
            <dl className="tabular mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
              {migrateResult.migrated && (
                <>
                  <Stat label="Dni" value={migrateResult.migrated.days} />
                  <Stat label="Zadania" value={migrateResult.migrated.tasks} />
                </>
              )}
              {d && (
                <>
                  <Stat label="Klienci" value={d.clientsProcessed} />
                  <Stat label="Miesiące" value={d.monthsProcessed} />
                  <Stat label="Dodane" value={d.tasksAdded} />
                  <Stat label="Zaktualizowane" value={d.tasksUpdated} />
                  <Stat label="Usunięte" value={d.tasksDeleted || 0} />
                  <Stat label="Błędy" value={d.errorsCount} />
                </>
              )}
            </dl>
          )}
          {d?.errors && d.errors.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
              {d.errors.map((err, i) => (
                <li key={i} className="rounded bg-background/60 px-2 py-1">
                  {err}
                </li>
              ))}
            </ul>
          )}
          {migrateResult.debug != null && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Szczegóły techniczne
              </summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-background p-3 text-[11px]">
                {JSON.stringify(migrateResult.debug, null, 2)}
              </pre>
            </details>
          )}
        </ResultBanner>
      )}

      {initResult && (
        <ResultBanner success={initResult.success}>
          <p className="font-medium">{initResult.message}</p>
        </ResultBanner>
      )}

      {infoLoading && !dbInfo ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 w-48" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : dbInfo ? (
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Rozmiar bazy
            </p>
            <p className="tabular font-display text-3xl font-semibold">{dbInfo.size}</p>
            {dbInfo.limitedPrivileges && dbInfo.message && (
              <p className="mt-1 text-sm text-muted-foreground">{dbInfo.message}</p>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Tabela</th>
                  <th className="px-4 py-2 text-right font-semibold">Wiersze</th>
                  <th className="px-4 py-2 text-right font-semibold">Rozmiar</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {dbInfo.tables.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                      Baza jest pusta — użyj „Utwórz brakujące tabele”.
                    </td>
                  </tr>
                ) : (
                  dbInfo.tables.map((t) => (
                    <tr key={t.name} className="border-t">
                      <td className="px-4 py-2.5 font-medium">{t.name}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {t.rows.toLocaleString('pl-PL')}
                      </td>
                      <td className="px-4 py-2.5 text-right">{t.size}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-lg border border-highlight-ink/40 bg-highlight/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-highlight-ink" />
          <div>
            <p className="font-medium">Nie udało się pobrać informacji o bazie.</p>
            <p className="mt-1 text-muted-foreground">
              Sprawdź w zakładce „Połączenie MySQL”, czy konfiguracja jest zapisana i test
              połączenia przechodzi, oraz czy użytkownik MySQL ma uprawnienia do odczytu metadanych.
            </p>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
