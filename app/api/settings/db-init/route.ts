import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getConfigFromEnvOrFile, resetPool } from '@/lib/db'
import mysql from 'mysql2/promise'

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

export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = getConfigFromEnvOrFile()
  if (!config) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 400 }
    )
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
    })

    // Sprawdź czy tabele już istnieją
    const [existingTables] = await connection.execute(
      `SHOW TABLES LIKE 'users'`
    ) as any[]

    const tablesExist = existingTables.length > 0

    // Utwórz tabele (CREATE TABLE IF NOT EXISTS jest bezpieczne)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS work_days (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_date (user_id, date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS time_slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        work_day_id INT NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (work_day_id) REFERENCES work_days(id) ON DELETE CASCADE,
        INDEX idx_work_day (work_day_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        work_day_id INT NOT NULL,
        description TEXT NOT NULL,
        assigned_by VARCHAR(255) DEFAULT '',
        start_time TIME DEFAULT '08:00:00',
        end_time TIME DEFAULT '16:00:00',
        completed TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (work_day_id) REFERENCES work_days(id) ON DELETE CASCADE,
        INDEX idx_work_day (work_day_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    // Sprawdź czy kolumny istnieją i dodaj jeśli nie
    try {
      const [columns] = await connection.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks'`,
        [config.database]
      ) as any[]

      const columnNames = columns.map((c: any) => c.COLUMN_NAME)

      // Dodaj assigned_by jeśli nie istnieje
      if (!columnNames.includes('assigned_by')) {
        await connection.execute(
          `ALTER TABLE tasks ADD COLUMN assigned_by VARCHAR(255) DEFAULT '' AFTER description`
        )
      }

      // Dodaj start_time jeśli nie istnieje
      if (!columnNames.includes('start_time')) {
        await connection.execute(
          `ALTER TABLE tasks ADD COLUMN start_time TIME DEFAULT '08:00:00' AFTER assigned_by`
        )
      }

      // Dodaj end_time jeśli nie istnieje
      if (!columnNames.includes('end_time')) {
        await connection.execute(
          `ALTER TABLE tasks ADD COLUMN end_time TIME DEFAULT '16:00:00' AFTER start_time`
        )
      }

      // Dodaj completed jeśli nie istnieje
      if (!columnNames.includes('completed')) {
        await connection.execute(
          `ALTER TABLE tasks ADD COLUMN completed TINYINT(1) DEFAULT 0 AFTER end_time`
        )
      }
    } catch (alterError) {
      // Ignoruj błąd jeśli kolumny już istnieją lub tabela nie istnieje
      console.log('Column check/alter skipped:', alterError)
    }

    // Wstaw domyślnego użytkownika jeśli nie istnieje
    const [existingUsers] = await connection.execute(
      `SELECT id FROM users WHERE email = ?`,
      ['admin@wtt.pl']
    ) as any[]

    if (existingUsers.length === 0) {
      // Hash hasła admin123 używając bcrypt (w produkcji użyj prawdziwego hash)
      // Dla uproszczenia użyjemy prostego hash - w produkcji użyj bcrypt
      const bcrypt = require('bcryptjs')
      const hashedPassword = await bcrypt.hash('admin123', 10)
      
      await connection.execute(
        `INSERT INTO users (email, password) VALUES (?, ?)`,
        ['admin@wtt.pl', hashedPassword]
      )
    }

    // Resetuj pool połączeń
    await resetPool()

    return NextResponse.json({
      success: true,
      message: tablesExist 
        ? 'Tabele zostały zaktualizowane pomyślnie (sprawdzono kolumnę assigned_by)'
        : 'Tabele zostały utworzone pomyślnie',
      alreadyExists: tablesExist,
      tablesCreated: ['users', 'work_days', 'time_slots', 'tasks']
    })
  } catch (error: any) {
    console.error('Error initializing database:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to initialize database',
        details: error.code
      },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

