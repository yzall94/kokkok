import { NextRequest, NextResponse } from 'next/server'
import { execute, isConfigured } from '@/lib/turso'

export async function POST(request: NextRequest) {
  try {
    const { phone_hash } = await request.json()
    if (!phone_hash) return NextResponse.json({ error: 'phone_hash required' }, { status: 400 })
    if (!isConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 500 })

    const receivedRes = await execute(
      `SELECT id, hint_text, matched, created_at, reveal_token, match_id, sender_name_encrypted
       FROM kokkok_entries WHERE target_phone_hash = ? ORDER BY created_at DESC LIMIT 20`,
      [phone_hash]
    )
    const sentRes = await execute(
      `SELECT id, hint_text, matched, created_at, reveal_token
       FROM kokkok_entries WHERE sender_phone_hash = ? ORDER BY created_at DESC LIMIT 20`,
      [phone_hash]
    )

    const received = receivedRes.rows.map(row => ({
      id: row.id,
      hint_text: row.hint_text,
      matched: !!row.matched,
      created_at: row.created_at,
      reveal_token: row.reveal_token,
      partner_name: row.matched
        ? Buffer.from(row.sender_name_encrypted as string, 'base64').toString('utf8')
        : undefined,
    }))

    const sent = sentRes.rows.map(row => ({
      id: row.id,
      hint_text: row.hint_text,
      matched: !!row.matched,
      created_at: row.created_at,
      reveal_token: row.reveal_token,
    }))

    return NextResponse.json({ received, sent })
  } catch (error) {
    console.error('[get-entries] error:', error)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}
