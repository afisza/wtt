import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const AVATARS_DIR = path.join(process.cwd(), 'public', 'avatars')

// Helper function to ensure avatars directory exists
function ensureAvatarsDir() {
  if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true })
  }
}

// POST - Upload awatara
export async function POST(request: NextRequest) {
  try {
    ensureAvatarsDir()
    
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'Brak pliku' },
        { status: 400 }
      )
    }

    // Sprawdź typ pliku
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Nieprawidłowy typ pliku. Dozwolone: JPEG, PNG, GIF, WebP' },
        { status: 400 }
      )
    }

    // Sprawdź rozmiar pliku (max 2MB)
    const maxSize = 2 * 1024 * 1024 // 2MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Plik jest za duży. Maksymalny rozmiar: 2MB' },
        { status: 400 }
      )
    }

    // Generuj unikalną nazwę pliku
    const timestamp = Date.now()
    const extension = path.extname(file.name) || '.jpg'
    const fileName = `${timestamp}${extension}`
    const filePath = path.join(AVATARS_DIR, fileName)

    // Zapisz plik
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    fs.writeFileSync(filePath, buffer)

    // Zwróć ścieżkę względną do public
    const avatarPath = `/avatars/${fileName}`
    
    return NextResponse.json({ 
      success: true, 
      avatar: avatarPath 
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Błąd podczas uploadowania awatara', details: error.message },
      { status: 500 }
    )
  }
}





