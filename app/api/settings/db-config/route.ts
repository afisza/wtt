import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { saveDbConfig, getDbConfig } from '@/lib/dbConfig'
import { testConnection, resetPool } from '@/lib/db'

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

// Pobierz konfigurację
export async function GET(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = getDbConfig()
    // Nie zwracaj hasła w odpowiedzi
    if (config) {
      const { password, ...configWithoutPassword } = config
      return NextResponse.json({ config: configWithoutPassword, hasPassword: !!password })
    }
    return NextResponse.json({ config: null })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 })
  }
}

// Zapisz konfigurację
export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { host, port, user, password, database } = await request.json()

    if (!host || !port || !user || !database) {
      return NextResponse.json(
        { error: 'Host, port, user i database są wymagane' },
        { status: 400 }
      )
    }

    const config = {
      host,
      port: parseInt(port),
      user,
      password: password || '', // Jeśli hasło nie zostało podane, użyj pustego
      database,
    }

    // Jeśli hasło nie zostało podane, zachowaj stare hasło
    if (!password) {
      const existingConfig = getDbConfig()
      if (existingConfig) {
        config.password = existingConfig.password
      }
    }

    saveDbConfig(config)
    
    // Resetuj pool połączeń aby użyć nowej konfiguracji
    await resetPool()
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving config:', error)
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}

// Test połączenia
export async function PUT(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { host, port, user, password, database } = await request.json()

    if (!host || !port || !user || !database) {
      return NextResponse.json(
        { error: 'Wszystkie pola są wymagane' },
        { status: 400 }
      )
    }

    // Jeśli hasło nie zostało podane, użyj zapisanego hasła z konfiguracji
    let finalPassword = password
    if (!finalPassword || finalPassword.trim() === '') {
      const existingConfig = getDbConfig()
      if (existingConfig && existingConfig.password) {
        finalPassword = existingConfig.password
      } else {
        finalPassword = ''
      }
    }

    const result = await testConnection({
      host,
      port: parseInt(port),
      user,
      password: finalPassword,
      database,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Connection test failed' },
      { status: 500 }
    )
  }
}

