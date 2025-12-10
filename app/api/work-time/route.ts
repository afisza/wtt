import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getMonthData, saveMonthData } from '@/lib/workTimeDb'
import { getMonthDataJSON, saveMonthDataJSON } from '@/lib/workTimeJson'

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

function isMySQLAvailable(): boolean {
  return !!(process.env.DB_HOST && process.env.DB_NAME)
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const monthKey = searchParams.get('month') || new Date().toISOString().substring(0, 7) // yyyy-MM
    
    let monthData: Record<string, any> = {}
    
    if (isMySQLAvailable()) {
      try {
        monthData = await getMonthData(userId, monthKey)
      } catch (error) {
        console.error('MySQL error, falling back to JSON:', error)
        monthData = getMonthDataJSON(userId, monthKey)
      }
    } else {
      monthData = getMonthDataJSON(userId, monthKey)
    }
    
    return NextResponse.json({ [monthKey]: monthData })
  } catch (error) {
    console.error('Error loading data:', error)
    return NextResponse.json({}, { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const workTimeData = await request.json()
    
    // workTimeData ma format: { "2024-09": { "2024-09-01": {...}, ... } }
    for (const [monthKey, daysData] of Object.entries(workTimeData)) {
      if (isMySQLAvailable()) {
        try {
          await saveMonthData(userId, monthKey, daysData as any)
        } catch (error) {
          console.error('MySQL error, falling back to JSON:', error)
          saveMonthDataJSON(userId, monthKey, daysData as any)
        }
      } else {
        saveMonthDataJSON(userId, monthKey, daysData as any)
      }
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving data:', error)
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 })
  }
}

