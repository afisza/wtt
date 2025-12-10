import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const ASSIGNERS_FILE = path.join(process.cwd(), 'data', 'assigners.json')

export interface Assigner {
  id: string
  name: string
  avatar?: string // ścieżka do awatara (np. /avatars/123.jpg)
  createdAt: string
  updatedAt: string
}

// Helper function to ensure data file exists
function ensureDataFile() {
  const dataDir = path.dirname(ASSIGNERS_FILE)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  if (!fs.existsSync(ASSIGNERS_FILE)) {
    fs.writeFileSync(ASSIGNERS_FILE, JSON.stringify([]), 'utf-8')
  }
}

// GET - Pobierz wszystkich zleceniodawców
export async function GET() {
  try {
    ensureDataFile()
    const fileContent = fs.readFileSync(ASSIGNERS_FILE, 'utf-8')
    const assigners: Assigner[] = fileContent ? JSON.parse(fileContent) : []
    return NextResponse.json(assigners)
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Błąd podczas pobierania zleceniodawców', details: error.message },
      { status: 500 }
    )
  }
}

// POST - Utwórz nowego zleceniodawcę
export async function POST(request: NextRequest) {
  try {
    ensureDataFile()
    
    let body
    try {
      body = await request.json()
    } catch (parseError: any) {
      return NextResponse.json(
        { error: 'Nieprawidłowy format JSON', details: parseError.message },
        { status: 400 }
      )
    }
    
    const { name, avatar } = body

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Nazwa jest wymagana' },
        { status: 400 }
      )
    }

    let fileContent
    try {
      fileContent = fs.readFileSync(ASSIGNERS_FILE, 'utf-8')
    } catch (readError: any) {
      console.error('Error reading assigners file:', readError)
      return NextResponse.json(
        { error: 'Błąd podczas odczytu pliku', details: readError.message },
        { status: 500 }
      )
    }
    
    let assigners: Assigner[] = []
    try {
      assigners = fileContent ? JSON.parse(fileContent) : []
    } catch (parseError: any) {
      console.error('Error parsing assigners file:', parseError)
      assigners = []
    }

    const newAssigner: Assigner = {
      id: Date.now().toString(),
      name: name.trim(),
      avatar: avatar || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    assigners.push(newAssigner)
    
    try {
      fs.writeFileSync(ASSIGNERS_FILE, JSON.stringify(assigners, null, 2), 'utf-8')
    } catch (writeError: any) {
      console.error('Error writing assigners file:', writeError)
      return NextResponse.json(
        { error: 'Błąd podczas zapisu pliku', details: writeError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(newAssigner, { status: 201 })
  } catch (error: any) {
    console.error('Unexpected error in POST /api/assigners:', error)
    return NextResponse.json(
      { error: 'Błąd podczas tworzenia zleceniodawcy', details: error.message || String(error) },
      { status: 500 }
    )
  }
}

// PUT - Aktualizuj zleceniodawcę
export async function PUT(request: NextRequest) {
  try {
    ensureDataFile()
    const body = await request.json()
    const { id, name, avatar } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID jest wymagane' },
        { status: 400 }
      )
    }

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Nazwa jest wymagana' },
        { status: 400 }
      )
    }

    const fileContent = fs.readFileSync(ASSIGNERS_FILE, 'utf-8')
    const assigners: Assigner[] = fileContent ? JSON.parse(fileContent) : []

    const index = assigners.findIndex(a => a.id === id)
    if (index === -1) {
      return NextResponse.json(
        { error: 'Zleceniodawca nie został znaleziony' },
        { status: 404 }
      )
    }

    // Jeśli zmieniamy awatar, usuń stary jeśli istnieje
    if (avatar && assigners[index].avatar && assigners[index].avatar !== avatar) {
      const oldAvatarPath = path.join(process.cwd(), 'public', assigners[index].avatar!)
      if (fs.existsSync(oldAvatarPath)) {
        try {
          fs.unlinkSync(oldAvatarPath)
        } catch (e) {
          // Ignoruj błędy usuwania
        }
      }
    }

    assigners[index] = {
      ...assigners[index],
      name: name.trim(),
      avatar: avatar || assigners[index].avatar,
      updatedAt: new Date().toISOString()
    }

    fs.writeFileSync(ASSIGNERS_FILE, JSON.stringify(assigners, null, 2), 'utf-8')

    return NextResponse.json(assigners[index])
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Błąd podczas aktualizacji zleceniodawcy', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Usuń zleceniodawcę
export async function DELETE(request: NextRequest) {
  try {
    ensureDataFile()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID jest wymagane' },
        { status: 400 }
      )
    }

    const fileContent = fs.readFileSync(ASSIGNERS_FILE, 'utf-8')
    const assigners: Assigner[] = fileContent ? JSON.parse(fileContent) : []

    const index = assigners.findIndex(a => a.id === id)
    if (index === -1) {
      return NextResponse.json(
        { error: 'Zleceniodawca nie został znaleziony' },
        { status: 404 }
      )
    }

    // Usuń awatar jeśli istnieje
    if (assigners[index].avatar) {
      const avatarPath = path.join(process.cwd(), 'public', assigners[index].avatar!)
      if (fs.existsSync(avatarPath)) {
        try {
          fs.unlinkSync(avatarPath)
        } catch (e) {
          // Ignoruj błędy usuwania
        }
      }
    }

    assigners.splice(index, 1)
    fs.writeFileSync(ASSIGNERS_FILE, JSON.stringify(assigners, null, 2), 'utf-8')

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Błąd podczas usuwania zleceniodawcy', details: error.message },
      { status: 500 }
    )
  }
}

