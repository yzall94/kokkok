'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import {
  sendVerification,
  verifyCode,
  submitKokkok,
  type SubmitResult,
} from '@/lib/api'
import { getSession, saveSession, clearSession, type Session } from '@/lib/session'

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'login' | 'splash' | 'target' | 'done' | 'admin'
type StatusType = 'success' | 'error' | ''

interface Status {
  type: StatusType
  msg: string
}

interface KkokkEntry {
  id: string
  hint_text: string | null
  matched: boolean
  created_at: string
  reveal_token: string
  partner_name?: string
  partner_phone?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function isValidPhone(phone: string): boolean {
  return /^01[016789]\d{7,8}$/.test(phone.replace(/-/g, ''))
}

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'YOUR_SUPABASE_URL'

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeartIcon({ size = 32, className = '', color }: { size?: number; className?: string; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {!color && (
        <defs>
          <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF5C8A" />
            <stop offset="100%" stopColor="#FF7A6E" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={color || "url(#heartGrad)"}
      />
    </svg>
  )
}

function StatusMsg({ status }: { status: Status }) {
  if (!status.type) return null
  return (
    <div className={`status-msg ${status.type}`}>
      <span>{status.type === 'success' ? '✓' : '!'}</span>
      <span>{status.msg}</span>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="back-btn" onClick={onClick} type="button">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M10 12L6 8L10 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      뒤로
    </button>
  )
}

function Particles() {
  const particles = useRef<
    { id: number; size: number; left: number; delay: number; duration: number }[]
  >([])

  if (particles.current.length === 0) {
    for (let i = 0; i < 8; i++) {
      particles.current.push({
        id: i,
        size: 40 + Math.random() * 80,
        left: Math.random() * 100,
        delay: Math.random() * 15,
        duration: 15 + Math.random() * 20,
      })
    }
  }

  return (
    <div className="particles" aria-hidden="true">
      {particles.current.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Step: Login ──────────────────────────────────────────────────────────────
function LoginStep({ onDone }: { onDone: (session: Session) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>({ type: '', msg: '' })
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCooldown() {
    setResendCooldown(60)
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setStatus({ type: 'error', msg: '이름을 입력해주세요.' })
      return
    }
    if (!isValidPhone(phone)) {
      setStatus({ type: 'error', msg: '올바른 휴대폰 번호를 입력해주세요.' })
      return
    }

    setLoading(true)
    setStatus({ type: '', msg: '' })

    try {
      await sendVerification(phone)
      setCodeSent(true)
      setStatus({ type: 'success', msg: '인증번호가 발송되었어요!' })
      startCooldown()
    } catch (err) {
      setStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : '전송에 실패했어요.',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length < 6) {
      setStatus({ type: 'error', msg: '6자리 인증번호를 입력해주세요.' })
      return
    }

    setLoading(true)
    setStatus({ type: '', msg: '' })

    try {
      const result = await verifyCode(phone, code)
      if (!result.verified) {
        setStatus({ type: 'error', msg: '인증번호가 틀렸어요.' })
        return
      }

      const session: Session = {
        name: name.trim(),
        phone,
        token: result.token,
        savedAt: Date.now(),
      }
      saveSession(session)
      onDone(session)
    } catch (err) {
      setStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : '인증에 실패했어요.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="step">
      <div className="flex items-center gap-3 mb-6 step step-delay-1">
        <HeartIcon size={28} className="heart-icon" />
        <h1 className="title">
          <span className="gradient-text">콕콕</span>
        </h1>
      </div>

      <p className="subtitle mb-8 step step-delay-2">
        익명으로 상대방에게 마음을 전해보세요.
        {IS_DEMO && (
          <span className="block mt-2 text-xs" style={{ color: 'rgba(255,200,100,0.8)' }}>
            ✦ 데모 모드 — 실제 SMS는 전송되지 않아요
          </span>
        )}
      </p>

      {!codeSent ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          <div className="step step-delay-3">
            <div className="section-label">이름</div>
            <input
              className="input"
              type="text"
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoComplete="name"
            />
          </div>

          <div className="step step-delay-4">
            <div className="section-label">휴대폰 번호</div>
            <input
              className="input"
              type="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              autoComplete="tel"
              inputMode="numeric"
            />
          </div>

          <div className="step step-delay-5 pt-2">
            <StatusMsg status={status} />
          </div>

          <div className="step step-delay-6">
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  전송 중…
                </>
              ) : (
                '인증번호 받기'
              )}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="step step-delay-1">
            <div className="section-label">인증번호 6자리</div>
            <input
              className="input"
              type="text"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
          </div>

          <div className="step step-delay-2">
            <StatusMsg status={status} />
          </div>

          <div className="step step-delay-3">
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  확인 중…
                </>
              ) : (
                '확인'
              )}
            </button>
          </div>

          <div className="step step-delay-4 text-center">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleSendCode}
              disabled={resendCooldown > 0 || loading}
            >
              {resendCooldown > 0
                ? `재전송 (${resendCooldown}초 후)`
                : '인증번호 다시 받기'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Step: Splash ─────────────────────────────────────────────────────────────
function SplashStep({
  session,
  onStart,
  onAdmin,
}: {
  session: Session
  onStart: () => void
  onAdmin: () => void
}) {
  return (
    <div className="step text-center">
      <div className="step step-delay-1 mb-2">
        <p className="section-label">안녕하세요, {session.name}님 👋</p>
      </div>

      <div className="step step-delay-2">
        <h1 className="title text-5xl mb-2">
          <span className="gradient-text">콕콕</span>
        </h1>
        <p className="subtitle">익명으로 마음을 전하는 서비스</p>
      </div>

      <div
        className="splash-orb-wrapper step step-delay-3"
        onClick={onStart}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onStart()}
        aria-label="시작하기"
      >
        <div className="splash-orb">
          <div className="splash-orb-inner">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <defs>
                <filter id="orbHeartGlow">
                  <feGaussianBlur stdDeviation="0.8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill="rgba(255,255,255,0.92)"
                filter="url(#orbHeartGlow)"
              />
            </svg>
          </div>
        </div>
      </div>

      <p className="touch-hint step step-delay-4">눌러서 시작</p>

      <div className="step step-delay-5 mt-28">
        <button
          type="button"
          className="btn-admin-link"
          onClick={onAdmin}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M20 21a8 8 0 1 0-16 0"/>
          </svg>
          마이페이지
        </button>
      </div>
    </div>
  )
}

// ─── Step: Target ─────────────────────────────────────────────────────────────
function TargetStep({
  session,
  onDone,
  onBack,
}: {
  session: Session
  onDone: (result: SubmitResult) => void
  onBack: () => void
}) {
  const [targetPhone, setTargetPhone] = useState('')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>({ type: '', msg: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const cleanTarget = targetPhone.replace(/-/g, '')
    const cleanSender = session.phone.replace(/-/g, '')

    if (!isValidPhone(targetPhone)) {
      setStatus({ type: 'error', msg: '올바른 휴대폰 번호를 입력해주세요.' })
      return
    }
    if (cleanTarget === cleanSender) {
      setStatus({ type: 'error', msg: '자기 자신에게는 콕콕할 수 없어요.' })
      return
    }

    setLoading(true)
    setStatus({ type: '', msg: '' })

    try {
      const result = await submitKokkok({
        sender_name: session.name,
        sender_phone: session.phone,
        target_phone: targetPhone,
        hint_text: hint.trim() || undefined,
        verification_token: session.token,
      })
      onDone(result)
    } catch (err) {
      setStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : '전송에 실패했어요.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="step">
      <BackButton onClick={onBack} />

      <div className="step step-delay-1 mb-6">
        <HeartIcon size={24} className="heart-icon mb-3" />
        <h2 className="title text-2xl">누구에게 콕콕?</h2>
        <p className="subtitle">상대방은 누가 보냈는지 알 수 없어요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="step step-delay-2">
          <div className="section-label">상대방 휴대폰 번호</div>
          <input
            className="input"
            type="tel"
            placeholder="010-0000-0000"
            value={targetPhone}
            onChange={(e) => setTargetPhone(formatPhone(e.target.value))}
            inputMode="numeric"
            autoFocus
          />
        </div>

        <div className="step step-delay-3">
          <div className="section-label">힌트 (선택)</div>
          <textarea
            className="input"
            placeholder="우리 자주 마주쳤었잖아요 ☕&#10;힌트를 남기면 상대방이 확인할 수 있어요."
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            maxLength={100}
          />
          <p className="text-right text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {hint.length}/100
          </p>
        </div>

        <div className="step step-delay-4">
          <StatusMsg status={status} />
        </div>

        <div className="step step-delay-5 pt-2">
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" />
                전송 중…
              </>
            ) : (
              '콕! 💗'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step: Done ───────────────────────────────────────────────────────────────
function DoneStep({
  matched,
  onAgain,
}: {
  matched: boolean
  onAgain: () => void
}) {
  return (
    <div className="step text-center">
      <div className="step step-delay-1 mb-6">
        <HeartIcon size={64} className="heart-icon mx-auto mb-4" />
        {matched ? (
          <>
            <h2 className="title text-2xl gradient-text">매칭됐어요! 💗</h2>
            <p className="subtitle mt-2">
              서로 같은 마음이에요!<br />
              문자로 연결 정보를 보내드렸어요.
            </p>
          </>
        ) : (
          <>
            <h2 className="title text-2xl">전송 완료 💌</h2>
            <p className="subtitle mt-2">
              상대방에게 익명 메시지를 보냈어요.<br />
              상대방도 콕콕하면 서로 연결돼요!
            </p>
          </>
        )}
      </div>

      <div className="entry-card step step-delay-2" style={{ textAlign: 'left' }}>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {matched
            ? '🎉 축하해요! 양쪽 모두에게 서로의 정보를 문자로 보냈어요.'
            : '📱 상대방이 다른 누군가에게 콕콕을 보내면, 그 사람이 내가 좋아하는 사람이라면 매칭이 성사돼요.'}
        </p>
      </div>

      <div className="step step-delay-3 mt-6 space-y-3">
        <button className="btn-primary" type="button" onClick={onAgain}>
          한 번 더 콕콕 💗
        </button>
      </div>
    </div>
  )
}

// ─── Step: Admin ──────────────────────────────────────────────────────────────
function AdminStep({
  session,
  onBack,
  onLogout,
}: {
  session: Session
  onBack: () => void
  onLogout: () => void
}) {
  const [tab, setTab] = useState<'received' | 'sent'>('received')
  const [receivedList, setReceivedList] = useState<KkokkEntry[]>([])
  const [sentList, setSentList] = useState<KkokkEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)

    if (IS_DEMO) {
      // Demo data
      const demoReceived: KkokkEntry[] = [
        {
          id: '1',
          hint_text: '우리 자주 마주쳤었잖아요 ☕',
          matched: true,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          reveal_token: 'demo-token-1',
          partner_name: '데모 사용자',
          partner_phone: '010-9876-5432',
        },
        {
          id: '2',
          hint_text: null,
          matched: false,
          created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
          reveal_token: 'demo-token-2',
        },
      ]
      const demoSent: KkokkEntry[] = [
        {
          id: '3',
          hint_text: '같이 밥 먹은 적 있어요',
          matched: false,
          created_at: new Date(Date.now() - 3600000).toISOString(),
          reveal_token: 'demo-token-3',
        },
      ]
      setReceivedList(demoReceived)
      setSentList(demoSent)
      setLoading(false)
      return
    }

    try {
      // Hash the user's phone for querying
      const encoder = new TextEncoder()
      const buf = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(session.phone.replace(/-/g, ''))
      )
      const phoneHash = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const db = getSupabase()
      if (!db) {
        setLoading(false)
        return
      }

      const [receivedRes, sentRes] = await Promise.all([
        db
          .from('kokkok_entries')
          .select('id, hint_text, matched, created_at, reveal_token, match_id')
          .eq('target_phone_hash', phoneHash)
          .order('created_at', { ascending: false })
          .limit(20),
        db
          .from('kokkok_entries')
          .select('id, hint_text, matched, created_at, reveal_token')
          .eq('sender_phone_hash', phoneHash)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      setReceivedList((receivedRes.data as KkokkEntry[]) || [])
      setSentList((sentRes.data as KkokkEntry[]) || [])
    } catch (err) {
      console.error('Failed to load admin data', err)
    } finally {
      setLoading(false)
    }
  }, [session.phone])

  useEffect(() => {
    loadData()
  }, [loadData])

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const list = tab === 'received' ? receivedList : sentList

  return (
    <div className="step">
      <BackButton onClick={onBack} />

      <div className="step step-delay-1 mb-6">
        <h2 className="title text-2xl">내 콕콕</h2>
        <p className="subtitle">{session.name}님의 콕콕 현황</p>
      </div>

      <div className="tab-bar step step-delay-2">
        <button
          type="button"
          className={`tab-btn ${tab === 'received' ? 'active' : ''}`}
          onClick={() => setTab('received')}
        >
          받은 콕콕 {receivedList.length > 0 && `(${receivedList.length})`}
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'sent' ? 'active' : ''}`}
          onClick={() => setTab('sent')}
        >
          보낸 콕콕 {sentList.length > 0 && `(${sentList.length})`}
        </button>
      </div>

      <div className="step step-delay-3">
        {loading ? (
          <div className="empty-state">
            <span className="spinner" /> 불러오는 중…
          </div>
        ) : list.length === 0 ? (
          <div className="empty-state">
            {tab === 'received'
              ? '아직 받은 콕콕이 없어요 💭'
              : '아직 보낸 콕콕이 없어요 💭'}
          </div>
        ) : (
          list.map((entry) => (
            <div
              key={entry.id}
              className={`entry-card ${entry.matched ? 'matched' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {tab === 'received'
                    ? entry.matched
                      ? `💗 ${entry.partner_name || '???'} (${entry.partner_phone || '???'})`
                      : '익명의 누군가'
                    : entry.matched
                      ? '매칭 성공! 💗'
                      : '대기 중…'}
                </span>
                {entry.matched && <span className="match-badge">💗 매칭</span>}
              </div>

              {entry.hint_text && (
                <p
                  className="text-sm mt-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  &ldquo;{entry.hint_text}&rdquo;
                </p>
              )}

              <p className="entry-meta">{formatDate(entry.created_at)}</p>
            </div>
          ))
        )}
      </div>

      <hr className="divider step step-delay-4" />

      <div className="step step-delay-5 text-center">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            clearSession()
            onLogout()
          }}
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [step, setStep] = useState<Step>('login')
  const [session, setSession] = useState<Session | null>(null)
  const [matchResult, setMatchResult] = useState<SubmitResult | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const existing = getSession()
    if (existing) {
      setSession(existing)
      setStep('splash')
    }
  }, [])

  function handleLoginDone(s: Session) {
    setSession(s)
    setStep('splash')
  }

  function handleSubmitDone(result: SubmitResult) {
    setMatchResult(result)
    setStep('done')
  }

  if (!mounted) {
    // SSR placeholder — avoids hydration mismatch
    return (
      <>
        <div className="bg-animated" aria-hidden="true" />
        <div className="app-shell">
          <div className="card" style={{ minHeight: 300 }} />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="bg-animated" aria-hidden="true" />
      <Particles />

      <main className="app-shell">
        <div className="card">
          {step === 'login' && <LoginStep onDone={handleLoginDone} />}

          {step === 'splash' && session && (
            <SplashStep
              session={session}
              onStart={() => setStep('target')}
              onAdmin={() => setStep('admin')}
            />
          )}

          {step === 'target' && session && (
            <TargetStep
              session={session}
              onDone={handleSubmitDone}
              onBack={() => setStep('splash')}
            />
          )}

          {step === 'done' && matchResult && (
            <DoneStep
              matched={matchResult.matched}
              onAgain={() => setStep('target')}
            />
          )}

          {step === 'admin' && session && (
            <AdminStep
              session={session}
              onBack={() => setStep('splash')}
              onLogout={() => {
                setSession(null)
                setStep('login')
              }}
            />
          )}
        </div>
      </main>
    </>
  )
}
