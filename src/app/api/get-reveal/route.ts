import { NextRequest, NextResponse } from 'next/server'
import { getTurso } from '@/lib/turso'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const db = getTurso()
    if (!db) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 })
    }

    // Find entry by reveal_token (support partial tokens from SMS)
    const result = await db.execute({
      sql: `SELECT id, sender_name_encrypted, hint_text, matched, match_id, expires_at
            FROM kokkok_entries
            WHERE reveal_token LIKE ? || '%'
            LIMIT 1`,
      args: [token],
    })

    if (result.rows.length === 0) {
      return NextResponse.json({ error: '링크를 찾을 수 없어요.' }, { status: 404 })
    }

    const entry = result.rows[0]

    // Check expiry
    if (entry.expires_at && new Date(entry.expires_at as string) < new Date()) {
      return NextResponse.json({ error: '링크가 만료되었어요.' }, { status: 410 })
    }

    const senderName = Buffer.from(entry.sender_name_encrypted as string, 'base64').toString('utf8')

    if (entry.matched && entry.match_id) {
      // Get partner info
      const partnerResult = await db.execute({
        sql: `SELECT sender_name_encrypted FROM kokkok_entries WHERE id = ?`,
        args: [entry.match_id],
      })

      let partnerName = '???'
      if (partnerResult.rows.length > 0) {
        partnerName = Buffer.from(partnerResult.rows[0].sender_name_encrypted as string, 'base64').toString('utf8')
      }

      return NextResponse.json({
        matched: true,
        partner_name: senderName,
        hint_text: entry.hint_text,
      })
    }

    return NextResponse.json({
      matched: false,
      hint_text: entry.hint_text,
    })
  } catch (error) {
    console.error('[get-reveal] error:', error)
    return NextResponse.json(
      { error: '정보를 불러오지 못했어요.' },
      { status: 500 }
    )
  }
}
