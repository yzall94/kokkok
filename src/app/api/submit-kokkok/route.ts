import { NextRequest, NextResponse } from 'next/server'
import { SolapiMessageService } from 'solapi'

export async function POST(request: NextRequest) {
  try {
    const { sender_name, sender_phone, target_phone, hint_text, verification_token } = await request.json()

    if (!sender_phone || !target_phone || !verification_token) {
      return NextResponse.json({ error: '필수 정보가 없습니다.' }, { status: 400 })
    }

    // reveal 토큰 생성
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const revealToken = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')

    // SMS 발송 (타겟에게)
    const API_KEY = process.env.SOLAPI_API_KEY?.trim()
    const API_SECRET = process.env.SOLAPI_API_SECRET?.trim()
    const SENDER = process.env.SOLAPI_SENDER?.trim()

    if (API_KEY && API_SECRET && SENDER) {
      const messageService = new SolapiMessageService(API_KEY, API_SECRET)
      const cleanTarget = target_phone.replace(/-/g, '')
      const revealUrl = `https://kokkok-nu.vercel.app/reveal?t=${revealToken}`

      const result = await messageService.send({
        to: cleanTarget,
        from: SENDER,
        text: `[콕콕] 누군가 당신에게 마음이 있어요 💌\n힌트를 확인해보세요: ${revealUrl}`,
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
    void hint_text

    return NextResponse.json({ success: true, matched: false, reveal_token: revealToken })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류'
    console.error('[submit-kokkok error]', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
