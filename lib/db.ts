import mysql from 'mysql2/promise'
import { getDbConfig } from './dbConfig'

let pool: mysql.Pool | null = null

export function getConfigFromEnvOrFile() {
  // Najpierw sprawdź zmienne środowiskowe
  if (process.env.DB_HOST && process.env.DB_NAME) {
    return {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
    }
  }
  
  // Jeśli nie ma zmiennych środowiskowych, sprawdź plik konfiguracyjny
  const config = getDbConfig()
  if (config) {
    return config
  }
  
  return null
}

export function getDbPool(): mysql.Pool | null {
  const config = getConfigFromEnvOrFile()
  
  if (!config) {
    return null
  }
  
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: 'Z', // Użyj UTC i konwertuj lokalnie, lub '+01:00' dla CET
    })
    
    // Ustaw strefę czasową dla każdego połączenia na Europe/Warsaw
    pool.on('connection', async (connection) => {
      try {
        await connection.execute(`SET time_zone = '+01:00'`) // CET (zimowy) / CEST (letni) - MySQL automatycznie obsługuje zmianę czasu
      } catch (error) {
        console.warn('Could not set MySQL timezone:', error)
      }
    })
  }
  return pool
}

// Resetuj pool połączeń (używane po zmianie konfiguracji)
export async function resetPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export async function query(sql: string, params?: any[]) {
  const pool = getDbPool()
  if (!pool) {
    throw new Error('Database not configured')
  }
  const [results] = await pool.execute(sql, params)
  return results
}

// Test połączenia z bazą danych
export async function testConnection(config: {
  host: string
  port: number
  user: string
  password: string
  database: string
}): Promise<{ success: boolean; error?: string; details?: string }> {
  let connection: mysql.Connection | null = null
  try {
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 10000, // 10 sekund timeout
      timezone: 'Z', // UTC
    })
    
    // Ustaw strefę czasową na Europe/Warsaw (CET/CEST)
    await connection.execute(`SET time_zone = '+01:00'`)
    
    await connection.ping()
    
    // Sprawdź czy baza danych istnieje
    const [databases] = await connection.execute(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [config.database]
    ) as any[]
    
    if (databases.length === 0) {
      return { 
        success: false, 
        error: `Baza danych "${config.database}" nie istnieje`,
        details: 'Sprawdź czy nazwa bazy danych jest poprawna w panelu hostingu'
      }
    }
    
    return { success: true }
  } catch (error: any) {
    let errorMessage = error.message || 'Connection failed'
    let details = ''
    
    // Lepsze komunikaty błędów
    if (error.code === 'ER_ACCESS_DENIED_ERROR' || errorMessage.includes('Access denied')) {
      errorMessage = 'Odmowa dostępu - nieprawidłowe dane logowania'
      details = 'Sprawdź:\n- Czy użytkownik i hasło są poprawne\n- Czy użytkownik ma uprawnienia do bazy danych\n- Czy IP serwera (192.71.244.206) jest dozwolone w ustawieniach hostingu'
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Połączenie odrzucone'
      details = 'Sprawdź:\n- Czy host i port są poprawne\n- Czy serwer MySQL jest dostępny\n- Czy firewall nie blokuje połączenia'
    } else if (error.code === 'ENOTFOUND' || errorMessage.includes('getaddrinfo')) {
      errorMessage = 'Nie można znaleźć hosta'
      details = 'Sprawdź czy adres hosta jest poprawny'
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      errorMessage = `Baza danych "${config.database}" nie istnieje`
      details = 'Sprawdź czy nazwa bazy danych jest poprawna w panelu hostingu'
    }
    
    return { success: false, error: errorMessage, details }
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

// Pobierz informacje o bazie danych
export async function getDatabaseInfo(): Promise<{
  size: string
  tables: Array<{ name: string; rows: number; size: string }>
} | null> {
  const config = getConfigFromEnvOrFile()
  if (!config) {
    console.error('Database config not found')
    return null
  }
  
  let connection: mysql.Connection | null = null
  try {
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 10000,
      timezone: 'Z', // UTC
    })
    const conn = connection

    // Ustaw strefę czasową na Europe/Warsaw (CET/CEST)
    await conn.execute(`SET time_zone = '+01:00'`)
    
    // Sprawdź połączenie
    await conn.ping()
    
    // Przełącz się na bazę danych
    await conn.execute(`USE \`${config.database}\``)
    
    let sizeMB = 0
    let tables: any[] = []
    
    try {
      // Spróbuj pobrać informacje z information_schema
      const [dbSizeResult] = await conn.execute(
        `SELECT 
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
         FROM information_schema.tables 
         WHERE table_schema = ?`,
        [config.database]
      ) as any[]
      
      sizeMB = dbSizeResult[0]?.size_mb || 0
      
      // Pobierz listę tabel z rozmiarami
      const [tablesResult] = await conn.execute(
        `SELECT 
          table_name AS name,
          ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
         FROM information_schema.tables 
         WHERE table_schema = ?
         ORDER BY table_name`,
        [config.database]
      ) as any[]
      
      // Pobierz dokładną liczbę wierszy dla każdej tabeli (table_rows jest tylko szacunkiem dla InnoDB)
      tables = await Promise.all(
        tablesResult.map(async (table: any) => {
          let rows = 0
          try {
            // Pobierz dokładną liczbę wierszy używając COUNT(*)
            const [countResult] = await conn.execute(
              `SELECT COUNT(*) as count FROM \`${table.name}\``
            ) as any[]
            rows = countResult[0]?.count || 0
          } catch (countError: any) {
            // Jeśli nie można pobrać COUNT, użyj table_rows jako fallback
            console.warn(`Cannot get row count for table ${table.name}:`, countError.message)
            try {
              const [tableRowsResult] = await conn.execute(
                `SELECT table_rows AS rows
                 FROM information_schema.tables 
                 WHERE table_schema = ? AND table_name = ?`,
                [config.database, table.name]
              ) as any[]
              rows = tableRowsResult[0]?.rows || 0
            } catch (fallbackError) {
              rows = 0
            }
          }
          
          return {
            name: table.name,
            rows: rows,
            size_mb: table.size_mb || 0,
          }
        })
      )
    } catch (infoSchemaError: any) {
      // Jeśli nie ma dostępu do information_schema, użyj alternatywnej metody
      console.warn('Cannot access information_schema, using alternative method:', infoSchemaError.message)
      
      // Pobierz listę tabel używając SHOW TABLES
      const [tablesResult] = await conn.execute(`SHOW TABLES`) as any[]
      
      const tableKey = `Tables_in_${config.database}`
      const tableNames = tablesResult.map((row: any) => row[tableKey])
      
      // Pobierz dokładną liczbę wierszy i rozmiar dla każdej tabeli
      tables = await Promise.all(
        tableNames.map(async (tableName: string) => {
          let rows = 0
          let size_mb = 0
          
          // Pobierz dokładną liczbę wierszy używając COUNT(*)
          try {
            const [countResult] = await conn.execute(
              `SELECT COUNT(*) as count FROM \`${tableName}\``
            ) as any[]
            rows = countResult[0]?.count || 0
          } catch (countError: any) {
            console.warn(`Cannot get row count for table ${tableName}:`, countError.message)
            rows = 0
          }
          
          // Spróbuj pobrać rozmiar używając SHOW TABLE STATUS
          try {
            const [statusResult] = await conn.execute(
              `SHOW TABLE STATUS LIKE ?`,
              [tableName]
            ) as any[]
            if (statusResult && statusResult.length > 0) {
              const table = statusResult[0]
              const dataLength = (table.Data_length || 0) / 1024 / 1024
              const indexLength = (table.Index_length || 0) / 1024 / 1024
              size_mb = dataLength + indexLength
              sizeMB += size_mb
            }
          } catch (statusError: any) {
            console.warn(`Cannot get table status for ${tableName}:`, statusError.message)
          }
          
          return {
            name: tableName,
            rows: rows,
            size_mb: size_mb,
          }
        })
      )
    }
    
    const size = sizeMB < 1 
      ? `${(sizeMB * 1024).toFixed(2)} KB`
      : `${sizeMB.toFixed(2)} MB`
    
    const tablesInfo = tables.map((table: any) => ({
      name: table.name,
      rows: table.rows || 0,
      size: table.size_mb < 1 
        ? `${(table.size_mb * 1024).toFixed(2)} KB`
        : `${table.size_mb.toFixed(2)} MB`,
    }))
    
    return {
      size,
      tables: tablesInfo,
    }
  } catch (error: any) {
    console.error('Error getting database info:', error)
    console.error('Config used:', { 
      host: config.host, 
      port: config.port, 
      user: config.user, 
      database: config.database,
      hasPassword: !!config.password 
    })
    throw error // Rzuć błąd zamiast zwracać null, aby API mogło go obsłużyć
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}
