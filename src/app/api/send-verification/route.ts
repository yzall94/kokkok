import { NextRequest, NextResponse } from 'next/server'
import { SolapiMessageService } from 'solapi'
import { generateCode, saveCode } from '@/lib/verification-store'

const API_KEY = process.env.SOLAPI_API_KEY?.trim() ?? ''
const API_SECRET = process.env.SOLAPI_API_SECRET?.trim() ?? ''
const SENDER = process.env.SOLAPI_SENDER?.trim() ?? ''

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json()

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: '휴대폰 번호를 입력해주세요.' },
        { status: 400 }
      )
    }

    const cleanPhone = phone.replace(/-/g, '')

    if (!/^01[016789]\d{7,8}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: '올바른 휴대폰 번호를 입력해주세요.' },
        { status: 400 }
      )
    }

    // Dev mode: skip SMS, use fixed code 000000
    if (!API_KEY || !API_SECRET || !SENDER) {
      console.log('[send-verification] DEV MODE — code: 000000')
      saveCode(cleanPhone, '000000')
      return NextResponse.json({ success: true })
    }

    const code = generateCode()
    saveCode(cleanPhone, code)

    const messageService = new SolapiMessageService(API_KEY, API_SECRET)

    await messageService.send({
      to: cleanPhone,
      from: SENDER,
      text: `[콕콕] 인증번호: ${code}\n5분 내에 입력해주세요.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[send-verification] SMS send error:', message)
    return NextResponse.json(
      { error: `문자 전송에 실패했어요. (${message})` },
      { status: 500 }
    )
  }
}
