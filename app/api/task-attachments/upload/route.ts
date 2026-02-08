import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'task-attachments')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_FILES_PER_TASK = 10
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

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

function ensureTaskDir(taskId: string): string {
  const taskIdSanitized = taskId.replace(/\D/g, '')
  if (!taskIdSanitized || taskIdSanitized.length < 6) {
    throw new Error('Invalid taskId')
  }
  const dir = path.join(UPLOAD_DIR, taskIdSanitized)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const taskId = formData.get('taskId') as string | null

    if (!file || !taskId?.trim()) {
      return NextResponse.json(
        { error: 'Brak pliku lub taskId' },
        { status: 400 }
      )
    }

    const taskIdClean = String(taskId).replace(/\D/g, '')
    if (taskIdClean.length < 6) {
      return NextResponse.json(
        { error: 'Nieprawidłowe taskId (min. 6 cyfr)' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Plik za duży. Maks. ${MAX_FILE_SIZE / 1024 / 1024} MB` },
        { status: 400 }
      )
    }

    const mime = file.type?.toLowerCase() || ''
    const allowed = ALLOWED_TYPES.some(t => t === mime) || mime.startsWith('image/')
    if (!allowed) {
      return NextResponse.json(
        { error: 'Nieprawidłowy typ pliku. Dozwolone: obrazy, PDF, DOC/DOCX' },
        { status: 400 }
      )
    }

    const dir = ensureTaskDir(taskIdClean)
    const existingFiles = fs.readdirSync(dir)
    if (existingFiles.length >= MAX_FILES_PER_TASK) {
      return NextResponse.json(
        { error: `Maks. ${MAX_FILES_PER_TASK} załączników na zadanie` },
        { status: 400 }
      )
    }

    const ext = path.extname(file.name) || '.bin'
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`
    const filePath = path.join(dir, safeName)

    const bytes = await file.arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(bytes))

    const url = `/task-attachments/${taskIdClean}/${safeName}`
    return NextResponse.json({ success: true, url })
  } catch (error: any) {
    console.error('Task attachment upload error:', error)
    return NextResponse.json(
      { error: error?.message || 'Błąd podczas uploadu' },
      { status: 500 }
    )
  }
}
