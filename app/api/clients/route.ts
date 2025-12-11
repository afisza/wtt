import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { query, getConfigFromEnvOrFile } from '@/lib/db'
import { getStorageMode } from '@/lib/dbConfig'
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
  // Sprawdź tryb przechowywania danych
  const storageMode = getStorageMode()
  if (storageMode === 'json') {
    return false
  }
  
  // Sprawdź konfigurację bazy danych
  const dbConfig = getConfigFromEnvOrFile()
  return dbConfig !== null
}

// GET - pobierz wszystkich klientów użytkownika
export async function GET(request: NextRequest) {
  // Debug: sprawdź czy cookies są przekazywane
  const allCookies = request.cookies.getAll()
  const authToken = request.cookies.get('auth_token')
  console.log('GET /api/clients - Cookies:', {
    allCookies: allCookies.map(c => ({ name: c.name, hasValue: !!c.value })),
    authToken: authToken ? 'present' : 'missing',
    authTokenValue: authToken?.value ? 'has value' : 'no value'
  })
  
  const userId = getUserId(request)
  console.log('GET /api/clients - userId:', userId)
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isMySQLAvailable()) {
    // Fallback do JSON
    try {
      const dataFile = path.join(process.cwd(), 'data', 'clients.json')
      if (fs.existsSync(dataFile)) {
        const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
        const userClients = data[userId] || []
        return NextResponse.json(userClients)
      }
      return NextResponse.json([])
    } catch (error) {
      return NextResponse.json([])
    }
  }

  try {
    const clients = await query(
      `SELECT id, name, logo, website, created_at, updated_at FROM clients WHERE user_id = ? ORDER BY created_at ASC`,
      [userId]
    ) as any[]
    
    return NextResponse.json(clients)
  } catch (error: any) {
    console.error('Error loading clients:', error)
    return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
  }
}

// POST - utwórz nowego klienta
export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, logo, website } = body

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required', details: 'Nazwa klienta jest wymagana' }, { status: 400 })
    }

    if (!isMySQLAvailable()) {
      // Fallback do JSON
      const dataFile = path.join(process.cwd(), 'data', 'clients.json')
      let data: Record<string, any[]> = {}
      
      if (fs.existsSync(dataFile)) {
        try {
          data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
        } catch (e) {
          console.error('Error reading clients.json:', e)
        }
      }

      const newClient = {
        id: Date.now(),
        name: name.trim(),
        logo: logo || '',
        website: website || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      if (!data[userId]) {
        data[userId] = []
      }
      data[userId].push(newClient)

      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8')
      return NextResponse.json(newClient)
    }

    const result = await query(
      `INSERT INTO clients (user_id, name, logo, website) VALUES (?, ?, ?, ?)`,
      [userId, name.trim(), logo || '', website || '']
    ) as any

    const newClient = {
      id: result.insertId,
      name: name.trim(),
      logo: logo || '',
      website: website || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    return NextResponse.json(newClient)
  } catch (error: any) {
    console.error('Error creating client:', error)
    return NextResponse.json({ 
      error: 'Failed to create client', 
      details: error.message || 'Nieznany błąd' 
    }, { status: 500 })
  }
}

// PUT - zaktualizuj klienta
export async function PUT(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, logo, website } = body

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required', details: 'Nazwa klienta jest wymagana' }, { status: 400 })
    }

    if (!isMySQLAvailable()) {
      // Fallback do JSON
      const dataFile = path.join(process.cwd(), 'data', 'clients.json')
      let data: Record<string, any[]> = {}
      
      if (fs.existsSync(dataFile)) {
        try {
          data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
        } catch (e) {
          console.error('Error reading clients.json:', e)
        }
      }

      if (!data[userId]) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }

      const clientIndex = data[userId].findIndex(c => c.id === parseInt(id))
      if (clientIndex === -1) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }

      // Usuń stare logo jeśli zmieniono
      const oldClient = data[userId][clientIndex]
      if (oldClient.logo && oldClient.logo !== logo && oldClient.logo.startsWith('/avatars/')) {
        const oldLogoPath = path.join(process.cwd(), 'public', oldClient.logo)
        if (fs.existsSync(oldLogoPath)) {
          try {
            fs.unlinkSync(oldLogoPath)
          } catch (e) {
            console.error('Error deleting old logo:', e)
          }
        }
      }

      data[userId][clientIndex] = {
        ...data[userId][clientIndex],
        name: name.trim(),
        logo: logo || '',
        website: website || '',
        updated_at: new Date().toISOString()
      }

      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8')
      return NextResponse.json(data[userId][clientIndex])
    }

    // Sprawdź czy klient należy do użytkownika
    const existingClient = await query(
      `SELECT id, logo FROM clients WHERE id = ? AND user_id = ?`,
      [id, userId]
    ) as any[]

    if (existingClient.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Usuń stare logo jeśli zmieniono
    if (existingClient[0].logo && existingClient[0].logo !== logo && existingClient[0].logo.startsWith('/avatars/')) {
      const oldLogoPath = path.join(process.cwd(), 'public', existingClient[0].logo)
      if (fs.existsSync(oldLogoPath)) {
        try {
          fs.unlinkSync(oldLogoPath)
        } catch (e) {
          console.error('Error deleting old logo:', e)
        }
      }
    }

    await query(
      `UPDATE clients SET name = ?, logo = ?, website = ? WHERE id = ? AND user_id = ?`,
      [name.trim(), logo || '', website || '', id, userId]
    )

    const updatedClient = {
      id: parseInt(id),
      name: name.trim(),
      logo: logo || '',
      website: website || '',
      updated_at: new Date().toISOString()
    }

    return NextResponse.json(updatedClient)
  } catch (error: any) {
    console.error('Error updating client:', error)
    return NextResponse.json({ 
      error: 'Failed to update client', 
      details: error.message || 'Nieznany błąd' 
    }, { status: 500 })
  }
}

// DELETE - usuń klienta
export async function DELETE(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    if (!isMySQLAvailable()) {
      // Fallback do JSON
      const dataFile = path.join(process.cwd(), 'data', 'clients.json')
      let data: Record<string, any[]> = {}
      
      if (fs.existsSync(dataFile)) {
        try {
          data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
        } catch (e) {
          console.error('Error reading clients.json:', e)
        }
      }

      if (!data[userId]) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }

      const clientIndex = data[userId].findIndex(c => c.id === parseInt(id))
      if (clientIndex === -1) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }

      const client = data[userId][clientIndex]
      
      // Usuń logo jeśli istnieje
      if (client.logo && client.logo.startsWith('/avatars/')) {
        const logoPath = path.join(process.cwd(), 'public', client.logo)
        if (fs.existsSync(logoPath)) {
          try {
            fs.unlinkSync(logoPath)
          } catch (e) {
            console.error('Error deleting logo:', e)
          }
        }
      }

      data[userId].splice(clientIndex, 1)
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8')
      return NextResponse.json({ success: true })
    }

    // Sprawdź czy klient należy do użytkownika i pobierz logo
    const existingClient = await query(
      `SELECT id, logo FROM clients WHERE id = ? AND user_id = ?`,
      [id, userId]
    ) as any[]

    if (existingClient.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Usuń logo jeśli istnieje
    if (existingClient[0].logo && existingClient[0].logo.startsWith('/avatars/')) {
      const logoPath = path.join(process.cwd(), 'public', existingClient[0].logo)
      if (fs.existsSync(logoPath)) {
        try {
          fs.unlinkSync(logoPath)
        } catch (e) {
          console.error('Error deleting logo:', e)
        }
      }
    }

    // Usuń klienta (cascade usunie powiązane work_days i tasks)
    await query(
      `DELETE FROM clients WHERE id = ? AND user_id = ?`,
      [id, userId]
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting client:', error)
    return NextResponse.json({ 
      error: 'Failed to delete client', 
      details: error.message || 'Nieznany błąd' 
    }, { status: 500 })
  }
}




