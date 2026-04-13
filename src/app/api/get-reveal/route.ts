import { NextRequest, NextResponse } from 'next/server'
import { execute, isConfigured } from '@/lib/turso'

export async function POST(request: NextRequest) {
  try {
    const { token, role } = await request.json()
    if (!token) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    if (!isConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 500 })

    const isSender = role === 'sender'

    const result = await execute(
      `SELECT id, sender_name_encrypted, hint_text, matched, match_id, expires_at, target_phone_masked
       FROM kokkok_entries WHERE reveal_token LIKE ? LIMIT 1`,
      [token + '%']
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: '링크를 찾을 수 없어요.' }, { status: 404 })
    }

    const entry = result.rows[0]
    if (entry.expires_at && new Date(entry.expires_at as string) < new Date()) {
      return NextResponse.json({ error: '링크가 만료되었어요.' }, { status: 410 })
    }

    const senderName = Buffer.from(entry.sender_name_encrypted as string, 'base64').toString('utf8')

    if (entry.matched && entry.match_id) {
      let partnerName = senderName

      if (isSender) {
        // 보낸 사람이 볼 때: 매칭된 상대방(수신자) 정보를 가져옴
        const matchResult = await execute(
          `SELECT sender_name_encrypted, sender_phone_hash FROM kokkok_entries WHERE id = ? LIMIT 1`,
          [entry.match_id as string]
        )
        if (matchResult.rows.length > 0) {
          partnerName = Buffer.from(matchResult.rows[0].sender_name_encrypted as string, 'base64').toString('utf8')
        }
      }

      return NextResponse.json({ matched: true, partner_name: partnerName, hint_text: entry.hint_text, role: isSender ? 'sender' : 'receiver' })
    }

    return NextResponse.json({ matched: false, hint_text: entry.hint_text, target_phone_masked: isSender ? entry.target_phone_masked : undefined, role: isSender ? 'sender' : 'receiver' })
  } catch (error) {
    console.error('[get-reveal] error:', error)
    return NextResponse.json({ error: '정보를 불러오지 못했어요.' }, { status: 500 })
  }
}
