import { NextResponse } from 'next/server'
import { executeBatch, isConfigured, SCHEMA_STATEMENTS } from '@/lib/turso'

export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 })
  }

  try {
    await executeBatch(SCHEMA_STATEMENTS)
    return NextResponse.json({ success: true, message: 'Schema initialized' })
  } catch (error) {
    console.error('[init-db] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Schema init failed' },
      { status: 500 }
    )
  }
}
