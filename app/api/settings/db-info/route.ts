import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getDatabaseInfo } from '@/lib/db'

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

export async function GET(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const info = await getDatabaseInfo()
    
    if (!info) {
      return NextResponse.json(
        { error: 'Database not configured or connection failed' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(info)
  } catch (error: any) {
    console.error('Database info error:', error)
    
    const isAccessDenied = error.code === 'ER_ACCESS_DENIED_ERROR' ||
      error.message?.includes('Access denied') ||
      error.message?.includes('information_schema')
    // Gdy użytkownik bazy nie ma dostępu do information_schema – zwróć 200 z ograniczoną informacją zamiast błędu
    if (isAccessDenied) {
      return NextResponse.json({
        size: '—',
        tables: [],
        limitedPrivileges: true,
        message: 'Połączenie działa. Szczegóły (rozmiar, lista tabel) wymagają uprawnień do information_schema (np. root).',
      })
    }
    
    let errorMessage = 'Failed to get database info'
    if (error.code === 'ER_BAD_DB_ERROR') {
      errorMessage = 'Database does not exist'
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused - check host and port'
    } else if (error.message) {
      errorMessage = error.message
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

