import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { writeFile, mkdir } from 'fs/promises'
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

export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Sprawdź typ pliku
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isValidType = validTypes.includes(file.type) || fileExtension === 'svg'
    
    if (!isValidType) {
      return NextResponse.json({ 
        error: 'Invalid file type', 
        details: 'Dozwolone formaty: JPEG, PNG, GIF, WebP, SVG' 
      }, { status: 400 })
    }

    // Sprawdź rozmiar pliku (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File too large', 
        details: 'Maksymalny rozmiar pliku: 5MB' 
      }, { status: 400 })
    }

    // Utwórz katalog jeśli nie istnieje
    const uploadDir = path.join(process.cwd(), 'public', 'avatars')
    await mkdir(uploadDir, { recursive: true })

    // Generuj unikalną nazwę pliku
    const timestamp = Date.now()
    let extension = file.name.split('.').pop()?.toLowerCase() || 'png'
    // Jeśli plik SVG ma inny MIME type, użyj rozszerzenia z nazwy
    if (extension === 'svg' || file.type === 'image/svg+xml') {
      extension = 'svg'
    }
    const fileName = `${timestamp}.${extension}`
    const filePath = path.join(uploadDir, fileName)

    // Zapisz plik
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Zwróć publiczny URL
    const publicUrl = `/avatars/${fileName}`

    return NextResponse.json({ url: publicUrl })
  } catch (error: any) {
    console.error('Error uploading logo:', error)
    return NextResponse.json({ 
      error: 'Failed to upload logo', 
      details: error.message || 'Nieznany błąd' 
    }, { status: 500 })
  }
}





