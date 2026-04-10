import { NextRequest, NextResponse } from 'next/server'
import { SolapiMessageService } from 'solapi'

export async function POST(request: NextRequest) {
  try {
    const { sender_name, sender_phone, target_phone, relationship, hint_text, reveal_token } = await request.json()

    if (!sender_phone || !target_phone || !reveal_token) {
      return NextResponse.json({ error: '필수 정보가 없습니다.' }, { status: 400 })
    }

    const revealToken = reveal_token

    // SMS 발송 (타겟에게)
    const API_KEY = process.env.SOLAPI_API_KEY?.trim()
    const API_SECRET = process.env.SOLAPI_API_SECRET?.trim()
    const SENDER = process.env.SOLAPI_SENDER?.trim()

    if (API_KEY && API_SECRET && SENDER) {
      const messageService = new SolapiMessageService(API_KEY, API_SECRET)
      const cleanTarget = target_phone.replace(/-/g, '')
      const revealUrl = `https://kokkok-nu.vercel.app/r/${revealToken}`

      const opener = relationship
        ? `${relationship}의 누군가가 당신을 좋아하고 있어요 🫣💗`
        : '누가 몰래 당신을 좋아하고 있어요 🫣💗'
      const lines = [opener, '']
      if (hint_text) {
        const preview = hint_text.length > 10 ? hint_text.slice(0, 10) + '…' : hint_text
        lines.push(`🔖 힌트: ${preview}`)
      }
      lines.push(`\n👇 아래 링크에서 마음을 전한 분이 남긴 힌트를 확인해봐요`)
      lines.push(revealUrl)

      const result = await messageService.send({
        to: cleanTarget,
        from: SENDER,
        text: lines.join('\n'),
      })
      console.log('[submit-kokkok] SMS result:', JSON.stringify(result))

      const failed = (result as { failedMessageList?: unknown[] }).failedMessageList
      if (failed && failed.length > 0) {
        console.error('[submit-kokkok] SMS failed:', JSON.stringify(failed))
      }
    } else {
      console.log('[submit-kokkok] 환경변수 없음 — SMS 미발송. revealToken:', revealToken)
    }

    void sender_name

    return NextResponse.json({ success: true, matched: false, reveal_token: revealToken })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류'
    console.error('[submit-kokkok error]', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
