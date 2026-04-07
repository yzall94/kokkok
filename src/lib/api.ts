const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const IS_DEMO = !SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL'

async function callEdgeFunction<T>(
  fnName: string,
  body: Record<string, unknown>
): Promise<T> {
  if (IS_DEMO) {
    return mockEdgeFunction<T>(fnName, body)
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Error calling ${fnName}`)
  }

  return data as T
}

// Demo mode mock responses
async function mockEdgeFunction<T>(
  fnName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _body: Record<string, unknown>
): Promise<T> {
  await new Promise((r) => setTimeout(r, 800)) // Simulate latency

  switch (fnName) {
    case 'send-verification':
      return { success: true } as T
    case 'verify-code':
      return {
        verified: true,
        token: 'demo-token-' + Math.random().toString(36).slice(2),
      } as T
    case 'submit-kokkok':
      return {
        success: true,
        matched: Math.random() > 0.7, // 30% chance of match in demo
      } as T
    case 'get-reveal':
      return {
        matched: true,
        partner_name: '데모 사용자',
        partner_phone: '010-1234-5678',
        hint_text: '우리 자주 마주쳤었잖아요 ☕',
      } as T
    default:
      throw new Error('Unknown function: ' + fnName)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendVerification(phone: string): Promise<{ success: boolean }> {
  return callEdgeFunction('send-verification', { phone })
}

export interface VerifyResult {
  verified: boolean
  token: string
}

export async function verifyCode(
  phone: string,
  code: string
): Promise<VerifyResult> {
  return callEdgeFunction('verify-code', { phone, code })
}

export interface SubmitParams {
  sender_name: string
  sender_phone: string
  target_phone: string
  hint_text?: string
  verification_token: string
}

export interface SubmitResult {
  success: boolean
  matched: boolean
}

export async function submitKokkok(params: SubmitParams): Promise<SubmitResult> {
  return callEdgeFunction('submit-kokkok', params)
}

export interface RevealData {
  matched: boolean
  partner_name?: string
  partner_phone?: string
  hint_text?: string
  error?: string
}

export async function getReveal(token: string): Promise<RevealData> {
  return callEdgeFunction('get-reveal', { token })
}
