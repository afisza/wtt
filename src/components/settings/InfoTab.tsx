import { useState } from 'react'
import { basePath } from '@/lib/apiBase'
import { useToast } from '@/contexts/ToastContext'
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
} from '@/components/ui/alert-dialog'

interface TableInfo {
  name: string
  rows: number
  size: string
}

export default function InfoTab() {
  const { showToast } = useToast()

  const [dbInfo, setDbInfo] = useState<{ size: string; tables: TableInfo[]; limitedPrivileges?: boolean; message?: string } | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(false)
  const [initResult, setInitResult] = useState<{ success: boolean; message?: string; alreadyExists?: boolean } | null>(null)
  const [migrateLoading, setMigrateLoading] = useState(false)
  const [migrateResult, setMigrateResult] = useState<{
    success: boolean
    message?: string
    migrated?: { days: number; tasks: number }
    progress?: { total: number; current: number; percentage: number; stage: string; details?: any }
    details?: {
      clientsProcessed: number
      monthsProcessed: number
      daysWithTasks: number
      daysSkipped: number
      tasksAdded: number
      tasksUpdated: number
      tasksDeleted: number
      errors: string[]
      errorsCount: number
    }
    debug?: any
  } | null>(null)

  const loadDatabaseInfo = async () => {
    setInfoLoading(true)
    setDbInfo(null)
    try {
      const response = await fetch(`${basePath}/api/settings/db-info`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setDbInfo(data)
      } else {
        const error = await response.json()
        console.error('Database info error:', error)
        setDbInfo(null)
      }
    } catch (error: any) {
      console.error('Error loading database info:', error)
      setDbInfo(null)
    } finally {
      setInfoLoading(false)
    }
  }

  const initializeDatabase = async () => {
    setInitLoading(true)
    setInitResult(null)
    try {
      const response = await fetch(`${basePath}/api/settings/db-init`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json()

      if (response.ok) {
        setInitResult({ success: true, message: data.message, alreadyExists: data.alreadyExists })
        setTimeout(() => {
          loadDatabaseInfo()
        }, 1000)
      } else {
        setInitResult({ success: false, message: data.error || 'Błąd inicjalizacji bazy danych' })
      }
    } catch (error: any) {
      setInitResult({ success: false, message: 'Wystąpił błąd podczas inicjalizacji bazy danych' })
    } finally {
      setInitLoading(false)
    }
  }

  const handleMigrateJSONToMySQL = async () => {
    setMigrateLoading(true)
    setMigrateResult(null)

    try {
      const response = await fetch(`${basePath}/api/settings/migrate-json-to-mysql`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await response.json()
      setMigrateResult(data)

      if (data.success) {
        setTimeout(() => {
          loadDatabaseInfo()
        }, 1000)
      }
    } catch (error: any) {
      console.error('Migration error:', error)
      setMigrateResult({ success: false, message: error.message || 'Błąd podczas migracji' })
      showToast('Błąd podczas migracji danych', 'error')
    } finally {
      setMigrateLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center flex-wrap gap-3">
          <CardTitle className="text-xl tracking-tight">Informacje o bazie danych</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={migrateLoading}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold disabled:bg-gray-300 transition-all hover:-translate-y-px"
                >
                  {migrateLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Migrowanie...</>
                  ) : 'Migruj JSON → MySQL'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Migracja danych</AlertDialogTitle>
                  <AlertDialogDescription>
                    Czy na pewno chcesz zmigrować wszystkie dane z JSON do MySQL? Ta operacja może zająć chwilę.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anuluj</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleMigrateJSONToMySQL}
                    className="bg-emerald-500 hover:bg-emerald-600"
                  >
                    Migruj
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              onClick={initializeDatabase}
              disabled={initLoading}
              className="bg-[#d22f27] hover:bg-[#b0251f] text-white font-semibold disabled:bg-gray-300 transition-all hover:-translate-y-px"
            >
              {initLoading ? 'Tworzenie...' : 'Utwórz tabele'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Migration progress */}
        {migrateLoading && (
          <div className="p-5 rounded-lg border-2 border-emerald-500 bg-[var(--app-card-alt)]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Migracja w toku...</span>
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {migrateResult?.progress?.percentage || 0}%
              </span>
            </div>
            <div className="w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-[width] duration-300 flex items-center justify-center text-white text-xs font-semibold"
                style={{ width: `${migrateResult?.progress?.percentage || 0}%` }}
              >
                {migrateResult?.progress?.percentage || 0}%
              </div>
            </div>
            {migrateResult?.progress?.stage && (
              <div className="mt-2 text-xs text-[var(--app-text-muted)]">
                {migrateResult.progress.stage}
              </div>
            )}
          </div>
        )}

        {/* Migration result */}
        {migrateResult && !migrateLoading && (
          <div
            className={cn(
              'p-5 rounded-lg border-2',
              migrateResult.success
                ? 'bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950 dark:to-green-900 border-emerald-500 text-emerald-900 dark:text-emerald-100'
                : 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-[#d22f27] text-red-900 dark:text-red-100'
            )}
          >
            <div className="flex items-center gap-3 mb-4">
              {migrateResult.success
                ? <CheckCircle2 size={20} className="shrink-0" />
                : <XCircle size={20} className="shrink-0" />
              }
              <strong className="text-sm">{migrateResult.message}</strong>
            </div>

            {migrateResult.migrated && (
              <div className="mb-4 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                <div className="text-sm font-semibold mb-2">Podsumowanie migracji:</div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 text-sm">
                  <div>Dni: <strong>{migrateResult.migrated.days}</strong></div>
                  <div>Zadania: <strong>{migrateResult.migrated.tasks}</strong></div>
                </div>
              </div>
            )}

            {migrateResult.details && (
              <div className="mb-4 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                <div className="text-sm font-semibold mb-2">Szczegóły migracji:</div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 text-sm">
                  <div>Klienci: <strong>{migrateResult.details.clientsProcessed}</strong></div>
                  <div>Miesiące: <strong>{migrateResult.details.monthsProcessed}</strong></div>
                  <div>Dni z zadaniami: <strong>{migrateResult.details.daysWithTasks}</strong></div>
                  <div>Dni pominięte: <strong>{migrateResult.details.daysSkipped}</strong></div>
                  <div>Zadania dodane: <strong className="text-emerald-600">{migrateResult.details.tasksAdded}</strong></div>
                  <div>Zadania zaktualizowane: <strong className="text-amber-500">{migrateResult.details.tasksUpdated}</strong></div>
                  <div>Zadania usunięte: <strong className="text-[#d22f27]">{migrateResult.details.tasksDeleted || 0}</strong></div>
                  <div>Błędy: <strong className={migrateResult.details.errorsCount > 0 ? 'text-[#d22f27]' : 'text-emerald-600'}>{migrateResult.details.errorsCount}</strong></div>
                </div>
              </div>
            )}

            {migrateResult.details?.errors && migrateResult.details.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50/80 dark:bg-red-950/30 rounded-lg border border-[#d22f27]">
                <div className="text-sm font-semibold mb-2 text-[#d22f27]">Błędy podczas migracji:</div>
                <div className="max-h-[200px] overflow-y-auto text-xs space-y-1">
                  {migrateResult.details.errors.map((error: string, index: number) => (
                    <div key={index} className="p-1.5 px-2 bg-white/50 dark:bg-black/20 rounded">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {migrateResult.debug && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold p-2 bg-white/50 dark:bg-black/20 rounded">
                  Szczegóły debugowania (kliknij, aby rozwinąć)
                </summary>
                <pre className="mt-2 p-3 bg-[var(--app-card-alt)] rounded-lg overflow-auto text-[11px] max-h-[400px] text-[var(--app-text)] border border-[var(--app-border)]">
                  {JSON.stringify(migrateResult.debug, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Init result */}
        {initResult && (
          <div
            className={cn(
              'p-4 rounded-lg border-2',
              initResult.success
                ? 'bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950 dark:to-green-900 border-emerald-500 text-emerald-900 dark:text-emerald-100'
                : 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-[#d22f27] text-red-900 dark:text-red-100'
            )}
          >
            <div className="flex items-center gap-3">
              {initResult.success
                ? <CheckCircle2 size={20} className="shrink-0" />
                : <XCircle size={20} className="shrink-0" />
              }
              <strong className="text-sm">{initResult.message}</strong>
            </div>
          </div>
        )}

        {/* DB info content */}
        {infoLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          </div>
        ) : dbInfo ? (
          <div className="space-y-8">
            {/* Size card */}
            <div className="p-5 rounded-xl border-2 border-purple-300 dark:border-neutral-700 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-neutral-900 dark:to-neutral-800">
              <h3 className="text-xs font-semibold text-[var(--app-text-muted)] uppercase tracking-wide mb-2">
                Rozmiar bazy danych
              </h3>
              <p className="text-3xl font-bold text-[#d22f27] m-0">{dbInfo.size}</p>
              {dbInfo.limitedPrivileges && dbInfo.message && (
                <p className="mt-3 text-sm text-[var(--app-text-muted)]">{dbInfo.message}</p>
              )}
            </div>

            {/* Tables */}
            <div>
              <h3 className="text-lg font-bold text-[var(--app-text)] mb-4">Tabele w bazie danych</h3>
              <div className="rounded-xl overflow-hidden border border-[var(--app-border)] shadow-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-3.5 text-left bg-[#d22f27] text-white font-semibold text-xs uppercase tracking-wide">Nazwa tabeli</th>
                      <th className="px-4 py-3.5 text-right bg-[#d22f27] text-white font-semibold text-xs uppercase tracking-wide">Liczba wierszy</th>
                      <th className="px-4 py-3.5 text-right bg-[#d22f27] text-white font-semibold text-xs uppercase tracking-wide">Rozmiar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbInfo.tables.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-[var(--app-text-muted)] text-sm bg-[var(--app-card)]">
                          Brak tabel w bazie danych
                        </td>
                      </tr>
                    ) : (
                      dbInfo.tables.map((table, index) => (
                        <tr
                          key={index}
                          className={cn(
                            'transition-colors hover:bg-purple-50 dark:hover:bg-neutral-700',
                            index % 2 === 0 ? 'bg-[var(--app-card)]' : 'bg-[var(--app-card-alt)]'
                          )}
                        >
                          <td className="px-4 py-3.5 border-b border-[var(--app-border)] font-semibold text-[var(--app-text)] text-sm">{table.name}</td>
                          <td className="px-4 py-3.5 border-b border-[var(--app-border)] text-right text-[var(--app-text-muted)] text-sm">{table.rows.toLocaleString()}</td>
                          <td className="px-4 py-3.5 border-b border-[var(--app-border)] text-right text-[#d22f27] font-semibold text-sm">{table.size}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={loadDatabaseInfo}
              className="border-2 border-[#d22f27] text-[#d22f27] bg-transparent hover:bg-[#d22f27] hover:text-white font-semibold transition-all hover:-translate-y-px"
            >
              Odśwież informacje
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-5 rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950 dark:to-yellow-900">
              <p className="font-bold text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="shrink-0" />
                <span>Nie można pobrać informacji o bazie danych</span>
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">Upewnij się, że:</p>
              <ul className="text-sm text-amber-800 dark:text-amber-200 pl-5 leading-loose list-disc">
                <li>Konfiguracja MySQL została zapisana</li>
                <li>Połączenie testowe zakończyło się sukcesem</li>
                <li>Użytkownik ma uprawnienia do odczytu informacji o bazie</li>
              </ul>
            </div>
            <Button
              onClick={loadDatabaseInfo}
              className="bg-[#d22f27] hover:bg-[#b0251f] text-white font-semibold transition-all hover:-translate-y-px"
            >
              Spróbuj ponownie
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
