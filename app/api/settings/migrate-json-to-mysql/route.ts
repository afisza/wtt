import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { query, getConfigFromEnvOrFile } from '@/lib/db'
import { getMonthDataJSON } from '@/lib/workTimeJson'
import fs from 'fs'
import path from 'path'

// Ustaw domyślną strefę czasową na Europe/Warsaw dla Node.js
if (typeof process !== 'undefined' && !process.env.TZ) {
  process.env.TZ = 'Europe/Warsaw'
}

function getUserId(request: NextRequest): number | null {
  const token = request.cookies.get('auth_token')?.value
  if (!token) return null
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as any
    return decoded.userId
  } catch {
    return null
  }
}

// Funkcja do tworzenia struktury tabel jeśli nie istnieją
async function ensureTablesExist(): Promise<void> {
  const config = getConfigFromEnvOrFile()
  if (!config) {
    throw new Error('Database config not found')
  }

  // Sprawdź i utwórz tabele
  try {
    // Tabela users
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    // Tabela clients
    await query(`
      CREATE TABLE IF NOT EXISTS clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        logo VARCHAR(500) DEFAULT '',
        website VARCHAR(500) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    // Tabela work_days
    await query(`
      CREATE TABLE IF NOT EXISTS work_days (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id INT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_client_date (user_id, client_id, date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        INDEX idx_client (client_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    // Tabela tasks
    await query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        work_day_id INT NOT NULL,
        description TEXT NOT NULL,
        assigned_by VARCHAR(500) DEFAULT '',
        start_time TIME DEFAULT '08:00:00',
        end_time TIME DEFAULT '16:00:00',
        status VARCHAR(50) DEFAULT 'do zrobienia',
        completed TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (work_day_id) REFERENCES work_days(id) ON DELETE CASCADE,
        INDEX idx_work_day (work_day_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    // Dodaj kolumny jeśli nie istnieją
    try {
      await query(`ALTER TABLE tasks ADD COLUMN assigned_by VARCHAR(500) DEFAULT '' AFTER description`)
    } catch (e: any) {
      if (!e.message?.includes('Duplicate column')) {
        // Sprawdź czy kolumna istnieje z inną długością i zmień jeśli potrzeba
        try {
          await query(`ALTER TABLE tasks MODIFY COLUMN assigned_by VARCHAR(500) DEFAULT ''`)
        } catch (e2) {
          // Ignoruj jeśli już jest VARCHAR(500)
        }
      }
    }

    try {
      await query(`ALTER TABLE tasks ADD COLUMN start_time TIME DEFAULT '08:00:00' AFTER assigned_by`)
    } catch (e: any) {
      if (!e.message?.includes('Duplicate column')) {}
    }

    try {
      await query(`ALTER TABLE tasks ADD COLUMN end_time TIME DEFAULT '16:00:00' AFTER start_time`)
    } catch (e: any) {
      if (!e.message?.includes('Duplicate column')) {}
    }

    try {
      await query(`ALTER TABLE tasks ADD COLUMN status VARCHAR(50) DEFAULT 'do zrobienia' AFTER end_time`)
    } catch (e: any) {
      if (!e.message?.includes('Duplicate column')) {}
    }

    try {
      await query(`ALTER TABLE clients ADD COLUMN website VARCHAR(500) DEFAULT '' AFTER logo`)
    } catch (e: any) {
      if (!e.message?.includes('Duplicate column')) {}
    }

    // Dodaj kolumnę completed do tasks jeśli nie istnieje
    try {
      await query(`ALTER TABLE tasks ADD COLUMN completed TINYINT(1) DEFAULT 0 AFTER status`)
    } catch (e: any) {
      if (!e.message?.includes('Duplicate column')) {
        // Sprawdź czy kolumna istnieje z inną definicją i zmień jeśli potrzeba
        try {
          await query(`ALTER TABLE tasks MODIFY COLUMN completed TINYINT(1) DEFAULT 0`)
        } catch (e2) {
          // Ignoruj jeśli już jest TINYINT(1)
        }
      }
    }

  } catch (error: any) {
    console.error('Error creating tables:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Sprawdź czy MySQL jest skonfigurowany (migracja wymaga MySQL)
    const config = getConfigFromEnvOrFile()
    if (!config) {
      return NextResponse.json({ 
        success: false, 
        error: 'MySQL nie jest skonfigurowany. Skonfiguruj bazę danych w ustawieniach przed migracją.',
        migrated: { days: 0, tasks: 0 }
      }, { status: 400 })
    }

    // 1. Upewnij się, że tabele istnieją
    await ensureTablesExist()

    // 1.5. Upewnij się, że użytkownik istnieje w bazie
    const existingUser = await query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    ) as any[]
    
    if (!existingUser || existingUser.length === 0) {
      // Utwórz użytkownika jeśli nie istnieje
      console.log(`[MIGRATION DEBUG] User ${userId} does not exist, creating...`)
      try {
        // Dla migracji używamy domyślnego użytkownika admin@wtt.pl
        const defaultEmail = 'admin@wtt.pl'
        const defaultPassword = await bcrypt.hash('admin123', 10)
        
        await query(
          'INSERT INTO users (id, email, password) VALUES (?, ?, ?)',
          [userId, defaultEmail, defaultPassword]
        )
        console.log(`[MIGRATION DEBUG] Created user ${userId} with email ${defaultEmail}`)
      } catch (userError: any) {
        console.error(`[MIGRATION ERROR] Could not create user ${userId}:`, userError.message)
        // Jeśli nie można utworzyć użytkownika z określonym ID (np. duplikat), sprawdź czy istnieje z innym ID
        const allUsers = await query('SELECT id, email FROM users') as any[]
        console.log(`[MIGRATION DEBUG] Existing users:`, allUsers)
        
        // Jeśli użytkownik już istnieje z tym samym emailem, użyj jego ID
        const userWithEmail = allUsers.find((u: any) => u.email === 'admin@wtt.pl')
        if (userWithEmail) {
          console.log(`[MIGRATION DEBUG] User with email admin@wtt.pl exists with ID ${userWithEmail.id}`)
          // Nie możemy zmienić userId, bo jest z JWT tokena
          // Lepiej zwróć błąd z informacją
          return NextResponse.json({
            success: false,
            error: `Użytkownik o ID ${userId} nie istnieje w bazie. Istnieje użytkownik z emailem admin@wtt.pl o ID ${userWithEmail.id}. Zaloguj się ponownie lub użyj tego użytkownika.`,
            migrated: { days: 0, tasks: 0 }
          }, { status: 400 })
        }
        
        return NextResponse.json({
          success: false,
          error: `Nie można utworzyć użytkownika: ${userError.message}`,
          migrated: { days: 0, tasks: 0 }
        }, { status: 500 })
      }
    } else {
      console.log(`[MIGRATION DEBUG] User ${userId} exists in database`)
    }

    // 2. Przeczytaj wszystkie dane z JSON (zawsze z pliku, niezależnie od trybu przechowywania)
    const DATA_FILE = path.join(process.cwd(), 'data', 'work-time.json')
    if (!fs.existsSync(DATA_FILE)) {
      return NextResponse.json({ 
        success: false, 
        message: 'Brak pliku work-time.json do migracji',
        migrated: { days: 0, tasks: 0 }
      }, { status: 404 })
    }

    const fileContent = fs.readFileSync(DATA_FILE, 'utf-8')
    if (!fileContent || fileContent.trim() === '') {
      return NextResponse.json({ 
        success: false, 
        message: 'Plik work-time.json jest pusty',
        migrated: { days: 0, tasks: 0 }
      }, { status: 400 })
    }
    
    let jsonData
    try {
      jsonData = JSON.parse(fileContent)
    } catch (parseError: any) {
      return NextResponse.json({ 
        success: false, 
        message: `Błąd parsowania JSON: ${parseError.message}`,
        migrated: { days: 0, tasks: 0 }
      }, { status: 400 })
    }
    
    if (!jsonData || typeof jsonData !== 'object') {
      return NextResponse.json({ 
        success: false, 
        message: 'Nieprawidłowy format danych w pliku JSON',
        migrated: { days: 0, tasks: 0 }
      }, { status: 400 })
    }

    // 2.5. Przeczytaj dane klientów z clients.json (dla nazw, logo, website)
    let clientsData: any = {}
    const CLIENTS_FILE = path.join(process.cwd(), 'data', 'clients.json')
    if (fs.existsSync(CLIENTS_FILE)) {
      try {
        const clientsFileContent = fs.readFileSync(CLIENTS_FILE, 'utf-8')
        if (clientsFileContent && clientsFileContent.trim() !== '') {
          clientsData = JSON.parse(clientsFileContent)
          console.log(`[MIGRATION DEBUG] Loaded clients.json with ${Object.keys(clientsData).length} user(s)`)
        }
      } catch (clientsParseError: any) {
        console.warn(`[MIGRATION WARNING] Could not parse clients.json: ${clientsParseError.message}`)
        // Kontynuuj bez danych klientów - użyjemy domyślnych nazw
      }
    } else {
      console.warn(`[MIGRATION WARNING] clients.json not found, will use default client names`)
    }
    
    // Sprawdź dostępne userId w JSON (dla debugowania)
    const availableUserIds = Object.keys(jsonData)
    console.log(`Available user IDs in JSON: ${availableUserIds.join(', ')}`)
    console.log(`Current user ID from JWT: ${userId} (type: ${typeof userId})`)
    
    // Spróbuj znaleźć dane użytkownika - sprawdź zarówno jako string jak i number
    let userData = jsonData[userId] || jsonData[String(userId)] || jsonData[Number(userId)]
    
    // Debug: sprawdź strukturę userData
    if (userData) {
      const firstClientKey = Object.keys(userData)[0]
      const firstClientData = userData[firstClientKey]
      console.log(`[MIGRATION DEBUG] First client key: ${firstClientKey}`)
      console.log(`[MIGRATION DEBUG] First client data type: ${typeof firstClientData}, isArray: ${Array.isArray(firstClientData)}`)
      if (firstClientData && typeof firstClientData === 'object') {
        const firstClientKeys = Object.keys(firstClientData)
        console.log(`[MIGRATION DEBUG] First client keys (should be months): ${firstClientKeys.join(', ')}`)
        console.log(`[MIGRATION DEBUG] First client keys count: ${firstClientKeys.length}`)
      }
    }
    
    const debugInfo: any = {
      requestedUserId: userId,
      userIdType: typeof userId,
      availableUserIds: availableUserIds,
      foundUserData: !!userData,
      userDataKeys: userData ? Object.keys(userData) : [],
      userDataStructure: userData ? {
        firstClientKey: Object.keys(userData)[0],
        firstClientDataKeys: userData[Object.keys(userData)[0]] && typeof userData[Object.keys(userData)[0]] === 'object' 
          ? Object.keys(userData[Object.keys(userData)[0]]) 
          : []
      } : null
    }
    
    if (!userData) {
      return NextResponse.json({ 
        success: false, 
        message: `Brak danych dla użytkownika ID: ${userId}. Dostępne ID w JSON: ${availableUserIds.join(', ')}`,
        migrated: { days: 0, tasks: 0 },
        debug: debugInfo
      })
    }

    // Oblicz całkowitą liczbę operacji do wykonania (dla progress bar)
    let totalOperations = 0
    let totalClients = 0
    let totalMonths = 0
    let totalDays = 0
    let totalTasks = 0
    
    // Najpierw policz wszystkie operacje
    for (const [clientIdStr, clientData] of Object.entries(userData)) {
      if (!clientData || typeof clientData !== 'object' || Array.isArray(clientData)) {
        continue
      }
      totalClients++
      const monthKeys = Object.keys(clientData)
      for (const monthKey of monthKeys) {
        if (!/^\d{4}-\d{2}$/.test(monthKey)) {
          continue
        }
        const monthData = (clientData as any)[monthKey]
        if (typeof monthData !== 'object' || monthData === null || Array.isArray(monthData)) {
          continue
        }
        totalMonths++
        const dayKeys = Object.keys(monthData)
        for (const dateKey of dayKeys) {
          const dayData = monthData[dateKey]
          if (dayData && dayData.tasks && Array.isArray(dayData.tasks)) {
            totalDays++
            totalTasks += dayData.tasks.length
          }
        }
      }
    }
    
    totalOperations = totalClients + totalMonths + totalDays + totalTasks
    
    let totalDaysMigrated = 0
    let totalTasksMigrated = 0
    let currentOperation = 0
    const migrationDetails: any = {
      clientsProcessed: 0,
      monthsProcessed: 0,
      daysWithTasks: 0,
      daysSkipped: 0,
      tasksAdded: 0,
      tasksUpdated: 0,
      tasksDeleted: 0,
      errors: [] as string[],
      progress: {
        total: totalOperations,
        current: 0,
        percentage: 0,
        stage: 'Initializing',
        details: {
          totalClients,
          totalMonths,
          totalDays,
          totalTasks
        }
      }
    }

    // 3. Przejdź przez wszystkie klienty i miesiące
    const clientKeys = Object.keys(userData)
    console.log(`Processing user data, clients found: ${clientKeys.length}`)
    migrationDetails.clientsFound = clientKeys.length
    migrationDetails.progress.stage = 'Processing clients'
    migrationDetails.progress.details.currentClient = 0
    
    for (const [clientIdStr, clientData] of Object.entries(userData)) {
      console.log(`[MIGRATION DEBUG] ===== Processing client: ${clientIdStr} =====`)
      console.log(`[MIGRATION DEBUG] Client data type: ${typeof clientData}, is object: ${typeof clientData === 'object'}, is array: ${Array.isArray(clientData)}`)
      console.log(`[MIGRATION DEBUG] Client data keys: ${clientData ? Object.keys(clientData).join(', ') : 'null'}`)
      console.log(`[MIGRATION DEBUG] Client data sample: ${JSON.stringify(clientData).substring(0, 500)}`)
      
      // clientsProcessed będzie zwiększone po pomyślnym utworzeniu lub znalezieniu klienta
      migrationDetails.progress.details.currentClient = migrationDetails.clientsProcessed
      if (migrationDetails.progress.total > 0) {
        migrationDetails.progress.current = currentOperation++
        migrationDetails.progress.percentage = Math.min(100, Math.round((migrationDetails.progress.current / migrationDetails.progress.total) * 100))
      }
      
      // Sprawdź czy clientData jest obiektem
      if (!clientData || typeof clientData !== 'object' || Array.isArray(clientData)) {
        console.warn(`[MIGRATION ERROR] Invalid client data for ${clientIdStr}, skipping...`)
        migrationDetails.errors.push(`Invalid client data structure for client ${clientIdStr} (type: ${typeof clientData}, isArray: ${Array.isArray(clientData)})`)
        continue
      }
      
      // Zapisz referencję do clientData przed modyfikacjami - użyj głębokiej kopii, aby uniknąć modyfikacji
      const originalClientData = JSON.parse(JSON.stringify(clientData))
      console.log(`[MIGRATION DEBUG] Created deep copy of clientData, keys: ${Object.keys(originalClientData).join(', ')}`)
      
      // ID klienta może być bardzo dużą liczbą (timestamp), użyj BigInt lub string
      let clientId: number | null = null
      
      // Spróbuj sparsować jako liczbę
      const parsedId = parseInt(clientIdStr)
      if (!isNaN(parsedId)) {
        clientId = parsedId
      } else {
        // Jeśli nie można sparsować, spróbuj znaleźć klienta po nazwie lub utworzyć nowego
        console.warn(`Invalid client ID format: ${clientIdStr}, skipping...`)
        continue
      }

      // Sprawdź czy klient istnieje w bazie (po ID lub po nazwie z oryginalnym ID w nazwie)
      let existingClient = await query(
        `SELECT id, name, logo, website FROM clients WHERE id = ? AND user_id = ?`,
        [clientId, userId]
      ) as any[]

      // Jeśli nie znaleziono po ID, sprawdź czy istnieje klient z nazwą zawierającą oryginalne ID
      if (!existingClient || existingClient.length === 0) {
        const clientNamePattern = `%${clientIdStr}%`
        existingClient = await query(
          `SELECT id, name, logo, website FROM clients WHERE user_id = ? AND name LIKE ?`,
          [userId, clientNamePattern]
        ) as any[]
      }

      // Pobierz dane klienta z clients.json (nazwa, logo, website)
      let clientName = `Klient ${clientIdStr}`
      let clientLogo = ''
      let clientWebsite = ''
      
      if (clientsData && clientsData[String(userId)] && Array.isArray(clientsData[String(userId)])) {
        const userClients = clientsData[String(userId)]
        const clientFromJson = userClients.find((c: any) => String(c.id) === clientIdStr || c.id === clientId)
        if (clientFromJson) {
          clientName = clientFromJson.name || clientName
          clientLogo = clientFromJson.logo || ''
          clientWebsite = clientFromJson.website || ''
          console.log(`[MIGRATION DEBUG] Found client data in clients.json: name="${clientName}", logo="${clientLogo}", website="${clientWebsite}"`)
        } else {
          console.log(`[MIGRATION DEBUG] Client ${clientIdStr} not found in clients.json, using default name`)
        }
      }

      if (!existingClient || existingClient.length === 0) {
        // Klient nie istnieje - utwórz nowego z danymi z clients.json
        try {
          // Sprawdź czy ID jest w zakresie INT (max 2147483647)
          if (clientId > 2147483647) {
            // ID jest za duże dla INT, utwórz nowego klienta z auto-increment ID
            const insertResult = await query(
              `INSERT INTO clients (user_id, name, logo, website) VALUES (?, ?, ?, ?)`,
              [userId, clientName, clientLogo, clientWebsite]
            ) as any
            const newClientId = insertResult.insertId
            console.log(`[MIGRATION DEBUG] Created new client with ID ${newClientId} for migrated data from JSON client ${clientIdStr} (name: "${clientName}")`)
            clientId = newClientId
          } else {
            // Spróbuj użyć oryginalnego ID
            try {
              await query(
                `INSERT INTO clients (id, user_id, name, logo, website) VALUES (?, ?, ?, ?, ?)`,
                [clientId, userId, clientName, clientLogo, clientWebsite]
              )
              console.log(`[MIGRATION DEBUG] Created client ${clientId} for user ${userId} (name: "${clientName}")`)
            } catch (insertError: any) {
              // Jeśli nie można użyć tego ID (np. duplikat lub błąd), utwórz nowego
              const insertResult = await query(
                `INSERT INTO clients (user_id, name, logo, website) VALUES (?, ?, ?, ?)`,
                [userId, clientName, clientLogo, clientWebsite]
              ) as any
              clientId = insertResult.insertId
              console.log(`[MIGRATION DEBUG] Created new client with ID ${clientId} (original ID ${clientIdStr} was invalid, name: "${clientName}")`)
            }
          }
        } catch (e: any) {
          console.warn(`[MIGRATION ERROR] Could not create client for ${clientIdStr}:`, e.message)
          migrationDetails.errors.push(`Could not create client ${clientIdStr}: ${e.message}`)
          continue
        }
      } else {
        // Klient już istnieje - użyj jego ID i zaktualizuj dane z clients.json jeśli są różnice
        const existingClientData = existingClient[0]
        clientId = existingClientData.id
        console.log(`[MIGRATION DEBUG] Client already exists with ID ${clientId}, checking if update needed`)
        
        // Sprawdź czy dane z clients.json różnią się od danych w bazie
        const needsUpdate = 
          existingClientData.name !== clientName ||
          existingClientData.logo !== clientLogo ||
          existingClientData.website !== clientWebsite
        
        if (needsUpdate && clientName !== `Klient ${clientIdStr}`) {
          // Zaktualizuj dane klienta z clients.json
          try {
            await query(
              `UPDATE clients SET name = ?, logo = ?, website = ? WHERE id = ?`,
              [clientName, clientLogo, clientWebsite, clientId]
            )
            console.log(`[MIGRATION DEBUG] Updated client ${clientId} with data from clients.json (name: "${clientName}")`)
          } catch (updateError: any) {
            console.warn(`[MIGRATION WARNING] Could not update client ${clientId}:`, updateError.message)
          }
        } else {
          console.log(`[MIGRATION DEBUG] Client ${clientId} data is up-to-date or using default name`)
        }
      }
      
      // Zwiększ licznik przetworzonych klientów (zarówno nowych jak i istniejących)
      migrationDetails.clientsProcessed++

      // Przejdź przez wszystkie miesiące - użyj oryginalnej referencji
      const monthKeys = Object.keys(originalClientData as any)
      const clientDataSample = JSON.stringify(originalClientData).substring(0, 300)
      console.log(`[MIGRATION DEBUG] After client creation, processing client ${clientIdStr}`)
      console.log(`[MIGRATION DEBUG] originalClientData type: ${typeof originalClientData}, isArray: ${Array.isArray(originalClientData)}`)
      console.log(`[MIGRATION DEBUG] originalClientData keys: ${monthKeys.join(', ')}`)
      console.log(`[MIGRATION DEBUG] months found: ${monthKeys.length}`)
      console.log(`[MIGRATION DEBUG] Client data sample: ${clientDataSample}`)
      
      // Dodaj informacje do debug
      migrationDetails.lastClientData = {
        clientIdStr,
        monthKeysCount: monthKeys.length,
        monthKeys: monthKeys,
        clientDataSample: clientDataSample,
        clientDataType: typeof originalClientData,
        isArray: Array.isArray(originalClientData),
        allKeys: Object.keys(originalClientData as any)
      }
      
      if (monthKeys.length === 0) {
        console.warn(`[MIGRATION ERROR] No months found for client ${clientIdStr} - skipping client`)
        console.warn(`[MIGRATION ERROR] Available keys: ${Object.keys(originalClientData as any).join(', ')}`)
        migrationDetails.errors.push(`No months found for client ${clientIdStr}. Available keys: ${Object.keys(originalClientData as any).join(', ')}`)
        continue
      }
      
      for (const [monthKey, monthData] of Object.entries(originalClientData as any)) {
        console.log(`[MIGRATION DEBUG] Checking key: "${monthKey}", type: ${typeof monthData}, isObject: ${typeof monthData === 'object' && monthData !== null}, isArray: ${Array.isArray(monthData)}`)
        
        // Sprawdź czy to jest miesiąc (format YYYY-MM) czy coś innego (np. pusty obiekt lub duplikat clientId)
        // Miesiąc powinien mieć format YYYY-MM
        const isMonthFormat = /^\d{4}-\d{2}$/.test(monthKey)
        
        if (!isMonthFormat) {
          // Sprawdź czy to pusty obiekt (artefakt danych) - nie traktuj jako błąd
          const isEmptyObject = typeof monthData === 'object' && monthData !== null && !Array.isArray(monthData) && Object.keys(monthData).length === 0
          
          if (isEmptyObject) {
            console.log(`[MIGRATION DEBUG] Skipping empty object key: "${monthKey}" (not a month, likely data artifact)`)
            // Nie dodawaj pustych obiektów do błędów - to tylko artefakty danych
          } else {
            console.log(`[MIGRATION DEBUG] Skipping non-month key: "${monthKey}" (not in YYYY-MM format, has ${typeof monthData === 'object' && monthData !== null ? Object.keys(monthData).length : 0} keys)`)
            // Dodaj do błędów tylko jeśli to nie jest pusty obiekt
            migrationDetails.errors.push(`Skipped non-month key: "${monthKey}" (not in YYYY-MM format)`)
          }
          continue
        }
        
        console.log(`[MIGRATION DEBUG] Processing month: ${monthKey}, type: ${typeof monthData}, is object: ${typeof monthData === 'object' && monthData !== null}, keys count: ${monthData && typeof monthData === 'object' ? Object.keys(monthData).length : 0}`)
        
        if (typeof monthData !== 'object' || monthData === null || Array.isArray(monthData)) {
          console.log(`[MIGRATION ERROR] Skipping invalid month data for ${monthKey}: type=${typeof monthData}, isArray=${Array.isArray(monthData)}`)
          migrationDetails.errors.push(`Invalid month data: ${monthKey} (type: ${typeof monthData}, isArray: ${Array.isArray(monthData)})`)
          continue
        }
        
        // Sprawdź czy miesiąc ma jakieś dni (nie jest pusty)
        const dayKeys = Object.keys(monthData)
        console.log(`[MIGRATION DEBUG] Month ${monthKey} has ${dayKeys.length} days`)
        if (dayKeys.length === 0) {
          console.log(`[MIGRATION DEBUG] Skipping empty month: ${monthKey}`)
          continue
        }

        migrationDetails.monthsProcessed++
        console.log(`[MIGRATION DEBUG] Successfully started processing month ${monthKey}, total months processed: ${migrationDetails.monthsProcessed}`)
        migrationDetails.progress.stage = `Processing month ${monthKey}`
        migrationDetails.progress.details.currentMonth = monthKey
        if (migrationDetails.progress.total > 0) {
          migrationDetails.progress.current = currentOperation++
          migrationDetails.progress.percentage = Math.min(100, Math.round((migrationDetails.progress.current / migrationDetails.progress.total) * 100))
        }
        
        // Przejdź przez wszystkie dni
        const daysInMonth = Object.keys(monthData).length
        console.log(`Processing month ${monthKey}, days found: ${daysInMonth}`)
        let daysWithTasks = 0
        let daysSkipped = 0
        
        for (const [dateKey, dayData] of Object.entries(monthData)) {
          if (typeof dayData !== 'object' || dayData === null) {
            daysSkipped++
            continue
          }

          const dayDataTyped = dayData as any
          const tasks = dayDataTyped.tasks || []

          if (!Array.isArray(tasks)) {
            daysSkipped++
            continue
          }

          if (tasks.length === 0) {
            daysSkipped++
            continue // Pomiń puste dni
          }
          
          daysWithTasks++
          migrationDetails.daysWithTasks++

          try {
            // Sprawdź czy dzień pracy istnieje (zapobieganie duplikatom)
            let workDayResult = await query(
              `SELECT id FROM work_days WHERE user_id = ? AND client_id = ? AND date = ?`,
              [userId, clientId, dateKey]
            ) as any[]

            let workDayId: number

            if (!workDayResult || workDayResult.length === 0) {
              // Dzień pracy nie istnieje - utwórz nowy
              const insertResult = await query(
                `INSERT INTO work_days (user_id, client_id, date) VALUES (?, ?, ?)`,
                [userId, clientId, dateKey]
              ) as any
              workDayId = insertResult.insertId
              console.log(`[MIGRATION DEBUG] Created work_day ID ${workDayId} for date ${dateKey}`)
            } else {
              // Dzień pracy już istnieje - użyj istniejącego ID (bez duplikatów)
              workDayId = workDayResult[0].id
              console.log(`[MIGRATION DEBUG] Work_day already exists with ID ${workDayId} for date ${dateKey}, using existing record`)
            }

            // Pobierz istniejące zadania dla tego dnia (dla inteligentnej migracji)
            const existingTasks = await query(
              `SELECT id, description, assigned_by, start_time, end_time, status 
               FROM tasks WHERE work_day_id = ?`,
              [workDayId]
            ) as any[]

            // Dodaj lub zaktualizuj zadania
            for (const task of tasks) {
              // Normalizuj assignedBy - może być string (stary format) lub string[] (nowy format)
              let assignedByJson = ''
              if (task.assignedBy) {
                if (Array.isArray(task.assignedBy)) {
                  assignedByJson = JSON.stringify(task.assignedBy)
                } else if (typeof task.assignedBy === 'string' && task.assignedBy.trim()) {
                  assignedByJson = JSON.stringify([task.assignedBy])
                }
              }

              // Określ status
              let status = task.status || 'do zrobienia'
              if (!status && task.completed !== undefined) {
                status = task.completed ? 'wykonano' : 'do zrobienia'
              }

              const startTime = task.startTime || '08:00'
              const endTime = task.endTime || '16:00'
              const description = task.text || ''

              // Sprawdź czy zadanie już istnieje (zapobieganie duplikatom)
              // Porównujemy: description, start_time, end_time, assigned_by
              const existingTask = existingTasks.find((et: any) => {
                const etAssignedBy = et.assigned_by || ''
                const etStartTime = et.start_time ? et.start_time.toString().substring(0, 5) : ''
                const etEndTime = et.end_time ? et.end_time.toString().substring(0, 5) : ''
                const taskStartTime = startTime.length === 5 ? startTime : startTime.padStart(5, '0')
                const taskEndTime = endTime.length === 5 ? endTime : endTime.padStart(5, '0')
                
                return et.description === description &&
                       etStartTime === taskStartTime &&
                       etEndTime === taskEndTime &&
                       etAssignedBy === assignedByJson
              })

              if (existingTask) {
                // Zadanie już istnieje - zaktualizuj je zamiast tworzyć duplikat
                const needsUpdate = 
                  existingTask.status !== status ||
                  existingTask.description !== description ||
                  existingTask.assigned_by !== assignedByJson ||
                  (existingTask.start_time ? existingTask.start_time.toString().substring(0, 5) : '') !== (startTime.length === 5 ? startTime : startTime.padStart(5, '0')) ||
                  (existingTask.end_time ? existingTask.end_time.toString().substring(0, 5) : '') !== (endTime.length === 5 ? endTime : endTime.padStart(5, '0'))

                if (needsUpdate) {
                  // Aktualizuj istniejące zadanie
                  await query(
                    `UPDATE tasks 
                     SET description = ?, assigned_by = ?, start_time = ?, end_time = ?, status = ?, completed = ?
                     WHERE id = ?`,
                    [
                      description,
                      assignedByJson,
                      startTime,
                      endTime,
                      status,
                      status === 'wykonano' ? 1 : 0,
                      existingTask.id
                    ]
                  )
                  totalTasksMigrated++
                  migrationDetails.tasksUpdated++
                  console.log(`[MIGRATION DEBUG] Updated existing task ID ${existingTask.id} for date ${dateKey}`)
                  if (migrationDetails.progress.total > 0) {
                    migrationDetails.progress.current = currentOperation++
                    migrationDetails.progress.percentage = Math.min(100, Math.round((migrationDetails.progress.current / migrationDetails.progress.total) * 100))
                  }
                } else {
                  // Zadanie istnieje i nie wymaga aktualizacji
                  console.log(`[MIGRATION DEBUG] Task already exists and is up-to-date (ID: ${existingTask.id}) for date ${dateKey}`)
                }
              } else {
                // Zadanie nie istnieje - dodaj nowe (tylko jeśli nie ma duplikatu)
                await query(
                  `INSERT INTO tasks (work_day_id, description, assigned_by, start_time, end_time, status, completed) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [
                    workDayId,
                    description,
                    assignedByJson,
                    startTime,
                    endTime,
                    status,
                    status === 'wykonano' ? 1 : 0
                  ]
                )
                totalTasksMigrated++
                migrationDetails.tasksAdded++
                console.log(`[MIGRATION DEBUG] Added new task for date ${dateKey}`)
                if (migrationDetails.progress.total > 0) {
                  migrationDetails.progress.current = currentOperation++
                  migrationDetails.progress.percentage = Math.min(100, Math.round((migrationDetails.progress.current / migrationDetails.progress.total) * 100))
                }
              }
            }

            // Usuń zadania, które są w bazie, ale nie ma ich w JSON (opcjonalne - można zakomentować jeśli nie chcesz usuwać)
            const jsonTaskKeys = tasks.map((t: any) => {
              const assignedByJson = t.assignedBy 
                ? (Array.isArray(t.assignedBy) ? JSON.stringify(t.assignedBy) : JSON.stringify([t.assignedBy]))
                : ''
              const startTime = (t.startTime || '08:00').length === 5 ? (t.startTime || '08:00') : (t.startTime || '08:00').padStart(5, '0')
              const endTime = (t.endTime || '16:00').length === 5 ? (t.endTime || '16:00') : (t.endTime || '16:00').padStart(5, '0')
              return `${t.text || ''}|${startTime}|${endTime}|${assignedByJson}`
            })

            for (const existingTask of existingTasks) {
              const etAssignedBy = existingTask.assigned_by || ''
              const etStartTime = existingTask.start_time ? existingTask.start_time.toString().substring(0, 5) : ''
              const etEndTime = existingTask.end_time ? existingTask.end_time.toString().substring(0, 5) : ''
              const taskKey = `${existingTask.description}|${etStartTime}|${etEndTime}|${etAssignedBy}`
              
              if (!jsonTaskKeys.includes(taskKey)) {
                // Zadanie jest w bazie, ale nie ma go w JSON - usuń je
                await query(`DELETE FROM tasks WHERE id = ?`, [existingTask.id])
                migrationDetails.tasksDeleted = (migrationDetails.tasksDeleted || 0) + 1
                if (migrationDetails.progress.total > 0) {
                  migrationDetails.progress.current = currentOperation++
                  migrationDetails.progress.percentage = Math.min(100, Math.round((migrationDetails.progress.current / migrationDetails.progress.total) * 100))
                }
              }
            }

            totalDaysMigrated++
            if (migrationDetails.progress.total > 0) {
              migrationDetails.progress.current = currentOperation++
              migrationDetails.progress.percentage = Math.min(100, Math.round((migrationDetails.progress.current / migrationDetails.progress.total) * 100))
            }
            migrationDetails.progress.stage = `Migrated day ${dateKey}`
          } catch (error: any) {
            const errorMsg = `Error migrating day ${dateKey} for client ${clientId}: ${error.message}`
            console.error(errorMsg)
            migrationDetails.errors.push(errorMsg)
            // Kontynuuj migrację innych dni
          }
        }
        
        migrationDetails.daysSkipped += daysSkipped
        console.log(`Month ${monthKey}: processed ${daysWithTasks} days with tasks, skipped ${daysSkipped} empty days`)
      }
    }
    
    migrationDetails.progress.percentage = 100
    migrationDetails.progress.stage = 'Completed'
    migrationDetails.progress.current = migrationDetails.progress.total
    
    console.log(`Migration completed: ${totalDaysMigrated} days, ${totalTasksMigrated} tasks`)
    console.log('Migration details:', JSON.stringify(migrationDetails, null, 2))

    return NextResponse.json({
      success: true,
      message: `Migracja zakończona pomyślnie`,
      migrated: {
        days: totalDaysMigrated,
        tasks: totalTasksMigrated
      },
      progress: migrationDetails.progress,
      details: {
        clientsProcessed: migrationDetails.clientsProcessed,
        monthsProcessed: migrationDetails.monthsProcessed,
        daysWithTasks: migrationDetails.daysWithTasks,
        daysSkipped: migrationDetails.daysSkipped,
        tasksAdded: migrationDetails.tasksAdded,
        tasksUpdated: migrationDetails.tasksUpdated,
        tasksDeleted: migrationDetails.tasksDeleted || 0,
        errors: migrationDetails.errors,
        errorsCount: migrationDetails.errors.length
      },
      debug: {
        ...debugInfo,
        migrationDetails
      }
    })
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Błąd podczas migracji danych',
      details: error.toString()
    }, { status: 500 })
  }
}

