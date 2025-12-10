import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { query } from '@/lib/db'
import fs from 'fs'
import path from 'path'

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

// POST - Migruj istniejące dane do klienta "Best Market"
export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (isMySQLAvailable()) {
      // Migracja MySQL
      // 1. Sprawdź czy klient "Best Market" już istnieje
      const existingClients = await query(
        `SELECT id FROM clients WHERE user_id = ? AND name = 'Best Market'`,
        [userId]
      ) as any[]

      let bestMarketClientId: number

      if (existingClients.length > 0) {
        bestMarketClientId = existingClients[0].id
      } else {
        // Utwórz klienta "Best Market"
        const insertResult = await query(
          `INSERT INTO clients (user_id, name, logo) VALUES (?, 'Best Market', '')`,
          [userId]
        ) as any
        bestMarketClientId = insertResult.insertId
      }

      // 2. Zaktualizuj wszystkie work_days bez client_id
      const updateResult = await query(
        `UPDATE work_days SET client_id = ? WHERE user_id = ? AND client_id IS NULL`,
        [bestMarketClientId, userId]
      ) as any

      return NextResponse.json({ 
        success: true, 
        message: 'Dane zostały przypisane do klienta "Best Market"',
        clientId: bestMarketClientId,
        updatedRows: updateResult.affectedRows || 0
      })
    } else {
      // Migracja JSON
      const workTimeFile = path.join(process.cwd(), 'data', 'work-time.json')
      const clientsFile = path.join(process.cwd(), 'data', 'clients.json')

      let workTimeData: any = {}
      let clientsData: any = {}

      // Wczytaj istniejące dane
      if (fs.existsSync(workTimeFile)) {
        workTimeData = JSON.parse(fs.readFileSync(workTimeFile, 'utf-8'))
      }
      if (fs.existsSync(clientsFile)) {
        clientsData = JSON.parse(fs.readFileSync(clientsFile, 'utf-8'))
      }

      // Sprawdź czy użytkownik ma dane w starej strukturze
      const userData = workTimeData[userId]
      if (userData && typeof userData === 'object') {
        const firstKey = Object.keys(userData)[0]
        if (firstKey && firstKey.match(/^\d{4}-\d{2}$/)) {
          // To stara struktura - migruj
          if (!clientsData[userId]) {
            clientsData[userId] = []
          }

          // Utwórz lub znajdź klienta "Best Market"
          let bestMarketClient = clientsData[userId].find((c: any) => c.name === 'Best Market')
          if (!bestMarketClient) {
            bestMarketClient = {
              id: Date.now(),
              name: 'Best Market',
              logo: '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
            clientsData[userId].push(bestMarketClient)
          }

          // Migruj dane do nowej struktury
          if (!workTimeData[userId]) {
            workTimeData[userId] = {}
          }
          if (!workTimeData[userId][bestMarketClient.id]) {
            workTimeData[userId][bestMarketClient.id] = {}
          }

          // Migruj dane do nowej struktury - skopiuj wszystkie miesiące
          const migratedData: any = {}
          for (const [monthKey, monthData] of Object.entries(userData)) {
            migratedData[monthKey] = monthData
          }

          // Zastąp starą strukturę nową
          workTimeData[userId] = {
            [bestMarketClient.id]: migratedData
          }

          // Zapisz zaktualizowane dane
          fs.writeFileSync(workTimeFile, JSON.stringify(workTimeData, null, 2), 'utf-8')
          fs.writeFileSync(clientsFile, JSON.stringify(clientsData, null, 2), 'utf-8')

          return NextResponse.json({ 
            success: true, 
            message: 'Dane JSON zostały przypisane do klienta "Best Market"',
            clientId: bestMarketClient.id
          })
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Dane są już w nowej strukturze lub brak danych do migracji'
      })
    }
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json({ 
      error: 'Failed to migrate data', 
      details: error.message || 'Nieznany błąd' 
    }, { status: 500 })
  }
}

