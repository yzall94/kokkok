import { NextRequest, NextResponse } from 'next/server'
import { SolapiMessageService } from 'solapi'
import { execute, isConfigured } from '@/lib/turso'

const SOLAPI_KEY = process.env.SOLAPI_API_KEY?.trim() ?? ''
const SOLAPI_SECRET = process.env.SOLAPI_API_SECRET?.trim() ?? ''
const SOLAPI_SENDER = process.env.SOLAPI_SENDER?.trim() ?? ''
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kokkok-nu.vercel.app'

async function hashPhone(phone: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(phone))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sender_name, sender_phone, target_phone, relationship, hint_text } = body

    if (!sender_name || !sender_phone || !target_phone) {
      return NextResponse.json({ error: '필수 정보가 누락되었어요.' }, { status: 400 })
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 })
    }

    const cleanSender = sender_phone.replace(/-/g, '')
    const cleanTarget = target_phone.replace(/-/g, '')
    const senderHash = await hashPhone(cleanSender)
    const targetHash = await hashPhone(cleanTarget)
    const revealToken = generateToken()
    const entryId = generateToken().slice(0, 32)
    const encryptedName = Buffer.from(sender_name).toString('base64')

    // Mask target phone: 01012345678 → 010-****-5678
    const targetMasked = cleanTarget.length >= 11
      ? `${cleanTarget.slice(0, 3)}-****-${cleanTarget.slice(7)}`
      : `${cleanTarget.slice(0, 3)}-****-${cleanTarget.slice(-4)}`

    await execute(
      `INSERT INTO kokkok_entries (id, sender_name_encrypted, sender_phone_hash, target_phone_hash, hint_text, relationship, reveal_token, target_phone_masked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [entryId, encryptedName, senderHash, targetHash, hint_text || null, relationship || null, revealToken, targetMasked]
    )

    // Check for mutual match
    const matchResult = await execute(
      `SELECT id FROM kokkok_entries WHERE sender_phone_hash = ? AND target_phone_hash = ? AND matched = 0 LIMIT 1`,
      [targetHash, senderHash]
    )

    let matched = false
    if (matchResult.rows.length > 0) {
      matched = true
      const matchId = matchResult.rows[0].id as string
      await execute(`UPDATE kokkok_entries SET matched = 1, match_id = ? WHERE id = ?`, [matchId, entryId])
      await execute(`UPDATE kokkok_entries SET matched = 1, match_id = ? WHERE id = ?`, [entryId, matchId])
    }

    // Send SMS
    if (SOLAPI_KEY && SOLAPI_SECRET && SOLAPI_SENDER) {
      try {
        const messageService = new SolapiMessageService(SOLAPI_KEY, SOLAPI_SECRET)
        const opener = relationship
          ? `${relationship}의 누군가가 당신을 좋아하고 있어요 🫣💗`
          : '누가 몰래 당신을 좋아하고 있어요 🫣💗'
        const lines = [opener, '']
        if (hint_text) {
          const preview = hint_text.length > 10 ? hint_text.slice(0, 10) + '…' : hint_text
          lines.push(`🔖 힌트: ${preview}`)
        }
        lines.push(`\n👇 확인하기`)
        lines.push(`${SITE_URL}/r/${revealToken.slice(0, 16)}`)
        await messageService.send({ to: cleanTarget, from: SOLAPI_SENDER, text: lines.join('\n') })
      } catch (smsErr) {
        console.error('[submit-kokkok] SMS error:', smsErr)
      }
    }

    return NextResponse.json({ success: true, matched, reveal_token: revealToken })
  } catch (error) {
    console.error('[submit-kokkok] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '전송에 실패했어요.' }, { status: 500 })
  }
}
