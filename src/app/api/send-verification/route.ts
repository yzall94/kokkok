import { NextRequest, NextResponse } from 'next/server'
import { SolapiMessageService } from 'solapi'
import { generateCode, saveCode } from '@/lib/verification-store'

const API_KEY = process.env.SOLAPI_API_KEY || ''
const API_SECRET = process.env.SOLAPI_API_SECRET || ''
const SENDER = process.env.SOLAPI_SENDER || ''

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

    const code = generateCode()
    saveCode(cleanPhone, code)

    if (!API_KEY || !API_SECRET || !SENDER) {
      // Dev/demo mode — log code to console
      console.log(`[DEV] Verification code for ${cleanPhone}: ${code}`)
      return NextResponse.json({ success: true })
    }

    const messageService = new SolapiMessageService(API_KEY, API_SECRET)

    await messageService.send({
      to: cleanPhone,
      from: SENDER,
      text: `[콕콕] 인증번호: ${code}\n5분 내에 입력해주세요.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('SMS send error:', error)
    return NextResponse.json(
      { error: '문자 전송에 실패했어요. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}
