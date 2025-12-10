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



