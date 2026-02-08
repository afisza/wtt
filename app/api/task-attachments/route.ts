import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'task-attachments')

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

function getUserId(request: NextRequest): number | null {
  const token = request.cookies.get('auth_token')?.value
  if (!token) return null
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as { userId: number }
    return decoded.userId
  } catch {
    return null
  }
}

/** Serwuje plik załącznika – unika 404 gdy Next/nginx nie serwuje public/task-attachments */
export async function GET(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url || !url.startsWith('/task-attachments/')) {
      return NextResponse.json({ error: 'Nieprawidłowy parametr url' }, { status: 400 })
    }

    const relative = url.replace(/^\/task-attachments\//, '').replace(/\.\./g, '')
    const parts = relative.split('/')
    if (parts.length !== 2) {
      return NextResponse.json({ error: 'Nieprawidłowy format url' }, { status: 400 })
    }

    const [taskId, filename] = parts
    if (!/^\d{6,}$/.test(taskId) || !filename || filename.includes('/')) {
      return NextResponse.json({ error: 'Nieprawidłowy taskId lub nazwa pliku' }, { status: 400 })
    }

    const filePath = path.join(UPLOAD_DIR, taskId, filename)
    const realPath = path.resolve(filePath)
    const baseDir = path.resolve(UPLOAD_DIR)
    if (!realPath.startsWith(baseDir) || !fs.existsSync(realPath)) {
      return NextResponse.json({ error: 'Plik nie istnieje' }, { status: 404 })
    }

    const ext = path.extname(filename).toLowerCase()
    const contentType = MIME[ext] || 'application/octet-stream'
    const buf = fs.readFileSync(realPath)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch (error: any) {
    console.error('Task attachment serve error:', error)
    return NextResponse.json(
      { error: error?.message || 'Błąd odczytu pliku' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url || !url.startsWith('/task-attachments/')) {
      return NextResponse.json({ error: 'Nieprawidłowy parametr url' }, { status: 400 })
    }

    const relative = url.replace(/^\/task-attachments\//, '').replace(/\.\./g, '')
    const parts = relative.split('/')
    if (parts.length !== 2) {
      return NextResponse.json({ error: 'Nieprawidłowy format url' }, { status: 400 })
    }

    const [taskId, filename] = parts
    if (!/^\d{6,}$/.test(taskId) || !filename || filename.includes('/')) {
      return NextResponse.json({ error: 'Nieprawidłowy taskId lub nazwa pliku' }, { status: 400 })
    }

    const filePath = path.join(UPLOAD_DIR, taskId, filename)
    const realPath = path.resolve(filePath)
    const baseDir = path.resolve(UPLOAD_DIR)
    if (!realPath.startsWith(baseDir) || !fs.existsSync(realPath)) {
      return NextResponse.json({ error: 'Plik nie istnieje' }, { status: 404 })
    }

    fs.unlinkSync(realPath)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Task attachment delete error:', error)
    return NextResponse.json(
      { error: error?.message || 'Błąd podczas usuwania' },
      { status: 500 }
    )
  }
}
