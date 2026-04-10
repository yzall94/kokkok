const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const IS_DEMO = !SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL'

async function callEdgeFunction<T>(
  fnName: string,
  body: object
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
  _body?: object
): Promise<T> {
  void _body
  await new Promise((r) => setTimeout(r, 800)) // Simulate latency

  switch (fnName) {
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

// ─── Internal API call helper ────────────────────────────────────────────────

async function callApi<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || '요청에 실패했어요.')
  }

  return data as T
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendVerification(phone: string): Promise<{ success: boolean }> {
  return callApi('/api/send-verification', { phone })
}

export interface VerifyResult {
  verified: boolean
  token: string
  error?: string
}

export async function verifyCode(
  phone: string,
  code: string
): Promise<VerifyResult> {
  return callApi('/api/verify-code', { phone, code })
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
  reveal_token?: string
}

export async function submitKokkok(params: SubmitParams): Promise<SubmitResult> {
  return callApi('/api/submit-kokkok', params)
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
