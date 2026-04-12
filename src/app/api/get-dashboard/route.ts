import { NextResponse } from 'next/server'
import { execute, isConfigured } from '@/lib/turso'

export async function GET() {
  if (!isConfigured()) return NextResponse.json({ entries: [] })

  try {
    const result = await execute(
      `SELECT id, sender_phone_hash, target_phone_hash, hint_text, matched, created_at
       FROM kokkok_entries ORDER BY created_at DESC LIMIT 5000`
    )

    const entries = result.rows.map(row => ({
      id: row.id,
      sender_phone_hash: row.sender_phone_hash,
      target_phone_hash: row.target_phone_hash,
      hint_text: row.hint_text,
      matched: !!row.matched,
      created_at: row.created_at,
    }))

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('[get-dashboard] error:', error)
    return NextResponse.json({ entries: [] })
  }
}
