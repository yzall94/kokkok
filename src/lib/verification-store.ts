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

export function verifyStoredCode(
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
