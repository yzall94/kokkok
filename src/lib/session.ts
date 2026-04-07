export interface Session {
  name: string
  phone: string
  token: string
  savedAt: number
}

const SESSION_KEY = 'kokkok_session'
const SESSION_TTL = 14 * 24 * 60 * 60 * 1000 // 2 weeks in ms

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const session = JSON.parse(raw) as Session

    // Expire old sessions
    if (Date.now() - session.savedAt > SESSION_TTL) {
      clearSession()
      return null
    }

    return session
  } catch {
    clearSession()
    return null
  }
}

export function saveSession(session: Session): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
}
