const IS_DEMO =
  !process.env.NEXT_PUBLIC_TURSO_CONFIGURED ||
  process.env.NEXT_PUBLIC_TURSO_CONFIGURED !== 'true'

// ─── API call helper ─────────────────────────────────────────────────────────

async function callApi<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || '요청에 실패했어요.')
  }

  return data as T
}

// ─── Verification ────────────────────────────────────────────────────────────

export async function sendVerification(phone: string): Promise<{ success: boolean }> {
  if (IS_DEMO) {
    await new Promise(r => setTimeout(r, 500))
    return { success: true }
  }
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
  if (IS_DEMO) {
    await new Promise(r => setTimeout(r, 500))
    if (code === '000000') {
      return { verified: true, token: 'demo-token-' + Date.now() }
    }
    return { verified: false, token: '', error: '인증번호가 틀렸어요. (데모: 000000)' }
  }
  return callApi('/api/verify-code', { phone, code })
}

// ─── Submit ──────────────────────────────────────────────────────────────────

export interface SubmitParams {
  sender_name: string
  sender_phone: string
  target_phone: string
  relationship?: string
  hint_text?: string
  verification_token: string
}

export interface SubmitResult {
  success: boolean
  matched: boolean
  reveal_token?: string
}

export async function submitKokkok(params: SubmitParams): Promise<SubmitResult> {
  if (IS_DEMO) {
    await new Promise(r => setTimeout(r, 800))
    return { success: true, matched: Math.random() > 0.7 }
  }
  return callApi('/api/submit-kokkok', params)
}

// ─── Reveal ──────────────────────────────────────────────────────────────────

export interface RevealData {
  matched: boolean
  partner_name?: string
  partner_phone?: string
  hint_text?: string
  error?: string
}

export async function getReveal(token: string): Promise<RevealData> {
  if (IS_DEMO) {
    await new Promise(r => setTimeout(r, 800))
    return {
      matched: true,
      partner_name: '데모 사용자',
      partner_phone: '010-1234-5678',
      hint_text: '우리 자주 마주쳤었잖아요 ☕',
    }
  }
  return callApi('/api/get-reveal', { token })
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getStats(): Promise<{ kokkoks: number; couples: number }> {
  if (IS_DEMO) {
    return { kokkoks: 13, couples: 4 }
  }
  return callApi('/api/get-stats')
}

// ─── Entries ─────────────────────────────────────────────────────────────────

export interface EntryData {
  id: string
  hint_text: string | null
  matched: boolean
  created_at: string
  reveal_token: string
  partner_name?: string
}

export async function getEntries(phoneHash: string): Promise<{ received: EntryData[]; sent: EntryData[] }> {
  if (IS_DEMO) {
    return { received: [], sent: [] }
  }
  return callApi('/api/get-entries', { phone_hash: phoneHash })
}
