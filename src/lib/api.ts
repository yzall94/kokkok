// All API calls go through Next.js API routes.
// No demo mode on client — server handles DB availability.

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
  return callApi('/api/get-reveal', { token })
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getStats(): Promise<{ kokkoks: number; couples: number }> {
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
  return callApi('/api/get-entries', { phone_hash: phoneHash })
}
