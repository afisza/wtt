import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { saveStorageMode, getStorageMode } from '@/lib/dbConfig'

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

// GET - pobierz tryb przechowywania
export async function GET(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const mode = getStorageMode()
    return NextResponse.json({ mode })
  } catch (error: any) {
    console.error('Error getting storage mode:', error)
    return NextResponse.json({ error: 'Failed to get storage mode' }, { status: 500 })
  }
}

// POST - zapisz tryb przechowywania
export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { mode } = body

    if (mode !== 'mysql' && mode !== 'json') {
      return NextResponse.json({ error: 'Invalid mode. Must be "mysql" or "json"' }, { status: 400 })
    }

    saveStorageMode(mode)
    return NextResponse.json({ success: true, mode })
  } catch (error: any) {
    console.error('Error saving storage mode:', error)
    return NextResponse.json({ error: 'Failed to save storage mode' }, { status: 500 })
  }
}

