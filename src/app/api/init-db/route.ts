import { NextResponse } from 'next/server'
import { getTurso, SCHEMA } from '@/lib/turso'

export async function POST() {
  const db = getTurso()
  if (!db) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 })
  }

  try {
    const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean)
    for (const stmt of statements) {
      await db.execute(stmt)
    }
    return NextResponse.json({ success: true, message: 'Schema initialized' })
  } catch (error) {
    console.error('[init-db] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Schema init failed' },
      { status: 500 }
    )
  }
}
