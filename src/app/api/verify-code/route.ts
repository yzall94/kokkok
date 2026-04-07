import { NextRequest, NextResponse } from 'next/server'
import { verifyStoredCode } from '@/lib/verification-store'

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json()

    if (!phone || !code) {
      return NextResponse.json(
        { error: '휴대폰 번호와 인증번호를 입력해주세요.' },
        { status: 400 }
      )
    }

    const cleanPhone = phone.replace(/-/g, '')
    const result = verifyStoredCode(cleanPhone, code)

    if (!result.valid) {
      return NextResponse.json(
        { verified: false, error: result.reason },
        { status: 200 }
      )
    }

    // Generate a simple session token
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const token = Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return NextResponse.json({ verified: true, token })
  } catch (error) {
    console.error('Verify error:', error)
    return NextResponse.json(
      { error: '인증 처리에 실패했어요.' },
      { status: 500 }
    )
  }
}
