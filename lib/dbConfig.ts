import fs from 'fs'
import path from 'path'

const CONFIG_FILE = path.join(process.cwd(), 'data', 'db-config.json')

export interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

// Zapisz konfigurację bazy danych
export function saveDbConfig(config: DatabaseConfig): void {
  const dataDir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

// Pobierz konfigurację bazy danych
export function getDbConfig(): DatabaseConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null
    }
    
    const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(fileContent)
  } catch (error) {
    return null
  }
}

// Sprawdź czy konfiguracja istnieje
export function hasDbConfig(): boolean {
  return fs.existsSync(CONFIG_FILE)
}

const STORAGE_MODE_FILE = path.join(process.cwd(), 'data', 'storage-mode.json')

export type StorageMode = 'mysql' | 'json'

// Zapisz tryb przechowywania danych
export function saveStorageMode(mode: StorageMode): void {
  const dataDir = path.dirname(STORAGE_MODE_FILE)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  
  fs.writeFileSync(STORAGE_MODE_FILE, JSON.stringify({ mode }, null, 2), 'utf-8')
}

// Pobierz tryb przechowywania danych (domyślnie MySQL)
export function getStorageMode(): StorageMode {
  try {
    if (fs.existsSync(STORAGE_MODE_FILE)) {
      const fileContent = fs.readFileSync(STORAGE_MODE_FILE, 'utf-8')
      const data = JSON.parse(fileContent)
      if (data.mode === 'mysql' || data.mode === 'json') {
        return data.mode
      }
    }
  } catch (error) {
    console.error('Error reading storage mode:', error)
  }
  
  // Domyślnie MySQL (nawet jeśli nie jest skonfigurowany - użytkownik może przełączyć na JSON)
  return 'mysql'
}



