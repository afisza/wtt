import { useEffect, useState, useCallback } from 'react'
import { basePath } from '@/lib/apiBase'
import { useToast } from '@/contexts/ToastContext'
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

interface TestResult {
  success: boolean
  error?: string
  details?: string
}

export default function ConfigTab() {
  const { showToast } = useToast()

  const [config, setConfig] = useState<Partial<DatabaseConfig>>({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
  })
  const [hasPassword, setHasPassword] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [storageMode, setStorageMode] = useState<'mysql' | 'json'>('mysql')

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch(`${basePath}/api/settings/db-config`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Settings - Loaded config data:', data)
        if (data.config) {
          setConfig({
            host: data.config.host || '',
            port: data.config.port || 3306,
            user: data.config.user || '',
            password: '', // Hasło nie jest zwracane z API ze względów bezpieczeństwa
            database: data.config.database || '',
          })
          setHasPassword(data.hasPassword || false)
          console.log('Settings - Config loaded:', {
            host: data.config.host,
            port: data.config.port,
            user: data.config.user,
            database: data.config.database,
            hasPassword: data.hasPassword
          })
        } else {
          console.log('Settings - No config found in response')
        }
      } else {
        console.error('Settings - Failed to load config:', response.status)
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
  }, [])

  const loadStorageMode = async () => {
    try {
      const response = await fetch(`${basePath}/api/settings/storage-mode`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setStorageMode(data.mode || 'mysql')
      }
    } catch (error) {
      console.error('Error loading storage mode:', error)
    }
  }

  useEffect(() => {
    loadConfig()
    loadStorageMode()
  }, [loadConfig])

  const handleStorageModeChange = async (mode: 'mysql' | 'json') => {
    try {
      const response = await fetch(`${basePath}/api/settings/storage-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode })
      })
      if (response.ok) {
        setStorageMode(mode)
        showToast(`Tryb przechowywania zmieniony na: ${mode === 'mysql' ? 'MySQL' : 'JSON'}`, 'success')
      } else {
        showToast('Błąd podczas zmiany trybu przechowywania', 'error')
      }
    } catch (error) {
      console.error('Error changing storage mode:', error)
      showToast('Błąd podczas zmiany trybu przechowywania', 'error')
    }
  }

  const handleSaveConfig = async () => {
    setConfigLoading(true)
    setTestResult(null)

    try {
      const response = await fetch(`${basePath}/api/settings/db-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(config),
      })

      const data = await response.json()

      if (response.ok) {
        showToast('Konfiguracja zapisana pomyślnie!', 'success')
        await loadConfig()
      } else {
        showToast(`Błąd: ${data.error}`, 'error')
      }
    } catch (error) {
      showToast('Wystąpił błąd podczas zapisywania konfiguracji', 'error')
    } finally {
      setConfigLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setTestLoading(true)
    setTestResult(null)

    try {
      const response = await fetch(`${basePath}/api/settings/db-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(config),
      })

      const data = await response.json()
      setTestResult(data)
    } catch (error) {
      setTestResult({ success: false, error: 'Wystąpił błąd podczas testowania połączenia' })
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl tracking-tight">Konfiguracja połączenia MySQL</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Tryb przechowywania danych */}
        <Card className="bg-[var(--app-card-alt)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tryb przechowywania danych</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--app-text-muted)] leading-relaxed">
              Wybierz sposób przechowywania danych zadań i czasu pracy.
              MySQL oferuje lepszą wydajność i skalowalność, JSON jest prostszy w konfiguracji.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => handleStorageModeChange('mysql')}
                className={cn(
                  'px-6 py-3 rounded-lg text-sm font-semibold border-2 flex items-center gap-2 transition-all',
                  storageMode === 'mysql'
                    ? 'bg-[#d22f27] text-white border-[#d22f27]'
                    : 'bg-[var(--app-card-alt)] text-[var(--app-text)] border-[var(--app-border)] hover:border-[#d22f27]'
                )}
              >
                {storageMode === 'mysql' && <CheckCircle2 size={16} className="shrink-0" />}
                <span>MySQL (domyślny)</span>
              </button>
              <button
                onClick={() => handleStorageModeChange('json')}
                className={cn(
                  'px-6 py-3 rounded-lg text-sm font-semibold border-2 flex items-center gap-2 transition-all',
                  storageMode === 'json'
                    ? 'bg-[#d22f27] text-white border-[#d22f27]'
                    : 'bg-[var(--app-card-alt)] text-[var(--app-text)] border-[var(--app-border)] hover:border-[#d22f27]'
                )}
              >
                {storageMode === 'json' && <CheckCircle2 size={16} className="shrink-0" />}
                <span>JSON (plik)</span>
              </button>
            </div>
            {storageMode === 'mysql' && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Info size={14} className="shrink-0" />
                <span>Dane będą zapisywane do bazy danych MySQL. Upewnij się, że konfiguracja jest poprawna.</span>
              </p>
            )}
            {storageMode === 'json' && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Dane będą zapisywane do pliku JSON (data/work-time.json). MySQL nie będzie używany.</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Form fields */}
        <div className="flex flex-col gap-6 max-w-[600px]">
          <div className="space-y-2">
            <Label className="font-semibold text-sm">Host</Label>
            <Input
              type="text"
              value={config.host || ''}
              onChange={(e) => setConfig({ ...config, host: e.target.value })}
              placeholder="np. localhost lub adres IP"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-sm">Port</Label>
            <Input
              type="number"
              value={config.port || 3306}
              onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 3306 })}
              placeholder="3306"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-sm">Użytkownik</Label>
            <Input
              type="text"
              value={config.user || ''}
              onChange={(e) => setConfig({ ...config, user: e.target.value })}
              placeholder="np. root"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-sm">
              Hasło{' '}
              {!config.password && hasPassword && (
                <span className="text-[#d22f27] text-xs font-normal">(użyje zapisanego)</span>
              )}
            </Label>
            <Input
              type="password"
              value={config.password || ''}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder={hasPassword ? 'Wprowadź nowe hasło lub pozostaw puste' : 'Wprowadź hasło'}
            />
            {hasPassword && (
              <p className="text-xs text-[var(--app-text-muted)]">
                {config.password ? 'Zostanie zapisane nowe hasło' : 'Pozostaw puste aby użyć zapisanego hasła przy teście połączenia'}
              </p>
            )}
            {!hasPassword && !config.password && (
              <p className="text-xs text-[#d22f27] flex items-center gap-1.5">
                <AlertTriangle size={12} className="shrink-0" />
                <span>Hasło jest wymagane do połączenia z bazą danych</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-sm">Nazwa bazy danych</Label>
            <Input
              type="text"
              value={config.database || ''}
              onChange={(e) => setConfig({ ...config, database: e.target.value })}
              placeholder="np. wtt"
            />
          </div>

          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testLoading || !config.host || !config.database}
              className="border-2 border-[#d22f27] text-[#d22f27] bg-transparent hover:bg-[#d22f27] hover:text-white font-semibold disabled:border-gray-300 disabled:text-gray-400 disabled:bg-gray-100 transition-all hover:-translate-y-px"
            >
              {testLoading ? 'Testowanie...' : 'Testuj połączenie'}
            </Button>

            <Button
              onClick={handleSaveConfig}
              disabled={configLoading || !config.host || !config.database}
              className="bg-[#d22f27] hover:bg-[#b0251f] text-white font-semibold disabled:bg-gray-300 transition-all hover:-translate-y-px"
            >
              {configLoading ? 'Zapisywanie...' : 'Zapisz konfigurację'}
            </Button>
          </div>

          {testResult && (
            <div
              className={cn(
                'p-4 rounded-lg border-2 mt-4',
                testResult.success
                  ? 'bg-gradient-to-br from-emerald-50 to-green-100 border-emerald-500 text-emerald-900'
                  : 'bg-gradient-to-br from-red-50 to-red-100 border-[#d22f27] text-red-900'
              )}
            >
              {testResult.success ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="shrink-0 text-emerald-700" />
                  <strong className="text-sm">Połączenie z bazą danych zostało nawiązane pomyślnie!</strong>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <XCircle size={20} className="shrink-0 text-red-800" />
                    <strong className="text-sm">Błąd połączenia:</strong>
                  </div>
                  <p className="font-semibold text-sm mb-2">{testResult.error}</p>
                  {testResult.details && (
                    <div className="mt-3 p-3 bg-black/5 rounded text-sm whitespace-pre-line leading-relaxed">
                      {testResult.details}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
