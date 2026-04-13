'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  sendVerification,
  verifyCode,
  submitKokkok,
  getStats,
  getEntries,
  type EntryData,
} from '@/lib/api'
import { getSession, saveSession, clearSession, type Session } from '@/lib/session'
import { pageview, trackScreen } from '@/lib/ga'

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'list' | 'compose' | 'login' | 'notice'

interface ChatMessage {
  id: string
  type: 'sent' | 'received' | 'system' | 'time'
  text: string
}

type KkokkEntry = EntryData

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

function nowTimeString(): string {
  const d = new Date()
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

// (stats + entries are now fetched via API routes)

const RELATIONSHIPS = [
  '같은 학교', '소꿉친구', '같은 직장',
  '동네 친구', '같은 동아리', '온라인에서', '기타',
]

// ─── Icons ────────────────────────────────────────────────────────────────────
function ChevronLeft({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function ComposeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </svg>
  )
}

function SendArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94l18.04-8.01a.75.75 0 0 0 0-1.37L3.478 2.404z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(60,60,67,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function KokkokLogo({ size = 28, color = 'gradient' }: { size?: number; color?: 'gradient' | 'white' }) {
  const fill = color === 'white' ? '#FFFFFF' : '#FF5C8A'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={fill}
      />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Messages List (unified landing)
// ═══════════════════════════════════════════════════════════════════════════════
function MessagesList({
  onCompose,
  onLoginRequest,
  onNotice,
  session,
  onLogout,
}: {
  onCompose: () => void
  onLoginRequest: () => void
  onNotice: (type: 'received' | 'sent') => void
  session: Session | null
  onLogout: () => void
}) {
  const [stats, setStats] = useState<{ kokkoks: number; couples: number } | null>(null)
  const [tab, setTab] = useState<'received' | 'sent'>('received')
  const [receivedList, setReceivedList] = useState<KkokkEntry[]>([])
  const [sentList, setSentList] = useState<KkokkEntry[]>([])
  const [listLoading, setListLoading] = useState(false)

  useEffect(() => {
    getStats().then(setStats).catch(() => {})
  }, [])

  const loadEntries = useCallback(async () => {
    if (!session) return
    setListLoading(true)
    try {
      const encoder = new TextEncoder()
      const buf = await crypto.subtle.digest('SHA-256', encoder.encode(session.phone.replace(/-/g, '')))
      const phoneHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
      const data = await getEntries(phoneHash)
      setReceivedList(data.received)
      setSentList(data.sent)
    } catch (err) { console.error('Failed to load entries', err) }
    finally { setListLoading(false) }
  }, [session])

  useEffect(() => { loadEntries() }, [loadEntries])

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const list = tab === 'received' ? receivedList : sentList

  return (
    <div className="ios-app landing-app">
      {/* ── Stats bar ───────────────────────────────────────────── */}
      {stats && (
        <div className="landing-stats-bar">
          <div className="landing-stat-item">
            <span className="landing-stat-num">{stats.kokkoks}</span>
            <span className="landing-stat-label">콕콕</span>
          </div>
          <span className="landing-stat-dot">·</span>
          <div className="landing-stat-item">
            <span className="landing-stat-num">{stats.couples}</span>
            <span className="landing-stat-label">커플 탄생</span>
          </div>
        </div>
      )}

      {/* ── User bar (above tabs when logged in) ───────────────── */}
      {session && (
        <div className="landing-user-section">
          <div className="landing-user">
            <span>👤 {session.name}</span>
            <button type="button" className="landing-user-logout" onClick={onLogout}>로그아웃</button>
          </div>
          {/* Match alert */}
          {(receivedList.some(e => e.matched) || sentList.some(e => e.matched)) && (
            <div className="landing-match-alert">
              <span className="landing-match-alert-sparkle">✨</span>
              누군가도 나를 좋아하고 있어요!!
              <span className="landing-match-alert-sparkle">✨</span>
            </div>
          )}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className={`landing-tabs ${session ? 'has-user' : ''}`}>
        <button
          type="button"
          className={`landing-tab ${tab === 'received' ? 'active' : ''}`}
          onClick={() => setTab('received')}
        >
          <span className="landing-tab-icon">📩</span>
          <span>받은 콕콕</span>
          {session && receivedList.length > 0 && <span className="landing-tab-badge">{receivedList.length}</span>}
        </button>
        <button
          type="button"
          className={`landing-tab ${tab === 'sent' ? 'active' : ''}`}
          onClick={() => setTab('sent')}
        >
          <span className="landing-tab-icon">📤</span>
          <span>보낸 콕콕</span>
          {session && sentList.length > 0 && <span className="landing-tab-badge">{sentList.length}</span>}
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="landing-content">
        {!session ? (
          /* Not logged in: show example messages */
          tab === 'received' ? (
            <div className="landing-examples">
              <button type="button" className="landing-example-cell" onClick={() => onNotice('received')}>
                <div className="landing-example-avi"><KokkokLogo size={22} color="white" /></div>
                <div className="landing-example-body">
                  <div className="landing-example-row">
                    <span className="landing-example-name">콕콕</span>
                    <span className="landing-example-time">방금</span>
                  </div>
                  <p className="landing-example-preview">누군가 당신을 좋아합니다 💌</p>
                </div>
                <span className="landing-example-chevron"><ChevronRight /></span>
              </button>
              <button type="button" className="landing-example-cell" onClick={() => onNotice('received')}>
                <div className="landing-example-avi"><KokkokLogo size={22} color="white" /></div>
                <div className="landing-example-body">
                  <div className="landing-example-row">
                    <span className="landing-example-name">콕콕</span>
                    <span className="landing-example-time">어제</span>
                  </div>
                  <p className="landing-example-preview">매칭됐어요! 서로 같은 마음이에요 🎉</p>
                </div>
                <span className="landing-example-chevron"><ChevronRight /></span>
              </button>
            </div>
          ) : (
            <div className="landing-examples">
              <button type="button" className="landing-example-cell" onClick={() => onNotice('sent')}>
                <div className="landing-example-avi sent">📤</div>
                <div className="landing-example-body">
                  <div className="landing-example-row">
                    <span className="landing-example-name">010-****-1234</span>
                    <span className="landing-example-time">방금</span>
                  </div>
                  <p className="landing-example-preview">우리 자주 마주쳤었잖아요 ☕</p>
                </div>
                <span className="landing-example-chevron"><ChevronRight /></span>
              </button>
              <button type="button" className="landing-example-cell" onClick={() => onNotice('sent')}>
                <div className="landing-example-avi sent">📤</div>
                <div className="landing-example-body">
                  <div className="landing-example-row">
                    <span className="landing-example-name">010-****-5678</span>
                    <span className="landing-example-time">3일 전</span>
                  </div>
                  <p className="landing-example-preview">같은 수업 듣는 사람이에요 📚 · 매칭 대기 중</p>
                </div>
                <span className="landing-example-chevron"><ChevronRight /></span>
              </button>
            </div>
          )
        ) : listLoading ? (
          <div className="landing-empty">
            <span className="ios-spinner ios-spinner-dark" /> 불러오는 중…
          </div>
        ) : list.length === 0 ? (
          <div className="landing-empty">
            {tab === 'received' ? '아직 받은 콕콕이 없어요 💭' : '아직 보낸 콕콕이 없어요 💭'}
          </div>
        ) : (
          <div className="landing-entries">
            {list.map(entry => (
              <button
                key={entry.id}
                type="button"
                className={`landing-entry ${entry.matched ? 'matched' : ''}`}
                onClick={() => window.location.href = `/reveal?t=${entry.reveal_token}${tab === 'sent' ? '&role=sender' : ''}`}
              >
                <div className="landing-entry-avi">{entry.matched ? '💗' : '💌'}</div>
                <div className="landing-entry-body">
                  <div className="landing-entry-name">
                    {tab === 'received'
                      ? entry.matched ? `${entry.partner_name || '???'}` : '익명의 누군가'
                      : entry.target_phone_masked || '알 수 없음'}
                  </div>
                  {entry.hint_text && <div className="landing-entry-hint">&ldquo;{entry.hint_text}&rdquo;</div>}
                  <div className="landing-entry-time">{formatDate(entry.created_at)}</div>
                </div>
                <span className="landing-entry-chevron"><ChevronRight /></span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <div className="landing-cta-area">
        <button className="landing-cta" type="button" onClick={onCompose}>
          <span className="landing-cta-icon"><ComposeIcon /></span>
          콕콕 보내기
        </button>
        {!session && (
          <button type="button" className="landing-login-link" onClick={onLoginRequest}>
            이미 보낸 사람이라면? <span>로그인하기</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="ios-share-footer">
        <ShareButton />
        <FeedbackButton />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notice View (iMessage-style chat with info from 콕콕)
// ═══════════════════════════════════════════════════════════════════════════════
function NoticeView({
  type,
  onCompose,
  onBack,
}: {
  type: 'received' | 'sent'
  onCompose: () => void
  onBack: () => void
}) {
  const isReceived = type === 'received'

  return (
    <div className="ios-chat-container">
      {/* Nav */}
      <div className="ios-chat-nav">
        <div className="ios-chat-nav-inner">
          <button className="ios-chat-nav-back" type="button" onClick={onBack}>
            <ChevronLeft />
          </button>
          <div className="ios-chat-nav-center">
            <span className="ios-chat-nav-name">콕콕</span>
          </div>
          <div style={{ width: 44 }} />
        </div>
      </div>

      {/* Chat area */}
      <div className="ios-chat-area">
        <div className="ios-chat-spacer" />

        {/* Avatar + name header */}
        <div className="notice-profile">
          <div className="notice-profile-avi"><KokkokLogo size={26} color="white" /></div>
          <span className="notice-profile-name">콕콕</span>
        </div>

        <div className="ios-time-header">오늘</div>

        {isReceived ? (
          <>
            <div className="ios-bubble ios-bubble-received">
              안녕하세요! 콕콕이에요
            </div>
            <div className="ios-bubble ios-bubble-received">
              누군가 당신에게 익명으로 마음을 전했어요!
            </div>
            <div className="ios-bubble ios-bubble-received">
              콕콕은 좋아하는 사람에게 익명으로 마음을 전하는 서비스예요.{'\n\n'}상대방이 누군지는 매칭 전까지 비밀이에요 🤫
            </div>
            <div className="ios-bubble ios-bubble-received">
              받은 메시지함에서는{'\n\n'}• 누군가 나에게 보낸 콕콕을 확인{'\n'}• 힌트로 누가 보냈는지 추측{'\n'}• 서로 콕콕하면 매칭 성공!
            </div>
          </>
        ) : (
          <>
            <div className="ios-bubble ios-bubble-received">
              여기는 보낸 메시지함이에요
            </div>
            <div className="ios-bubble ios-bubble-received">
              콕콕을 보내면 상대방에게 익명 메시지가 전달돼요.{'\n\n'}내 번호는 절대 노출되지 않아요 🔒
            </div>
            <div className="ios-bubble ios-bubble-received">
              보낸 메시지함에서는{'\n\n'}• 내가 보낸 콕콕 목록 확인{'\n'}• 매칭되면 &quot;매칭됨&quot; 표시{'\n'}• 매칭 전이면 &quot;대기 중&quot;
            </div>
          </>
        )}

        {/* CTA as a bubble */}
        <button type="button" className="notice-cta-bubble" onClick={onCompose}>
          콕콕하러 가기 →
        </button>

        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Login Page (for 받은 콕콕 click)
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({
  onDone,
  onBack,
}: {
  onDone: (session: Session) => void
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCooldown() {
    setCooldown(60)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function handleSendCode() {
    if (!name.trim()) { setError('이름을 입력해주세요.'); return }
    if (!isValidPhone(phone)) { setError('올바른 휴대폰 번호를 입력해주세요.'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      await sendVerification(phone)
      setCodeSent(true)
      setSuccess('인증번호가 발송되었어요!')
      startCooldown()
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송에 실패했어요.')
    } finally { setLoading(false) }
  }

  async function handleVerify() {
    if (code.length < 6) { setError('6자리 인증번호를 입력해주세요.'); return }
    setLoading(true); setError('')
    try {
      const result = await verifyCode(phone, code)
      if (!result.verified) { setError(result.error || '인증번호가 틀렸어요.'); return }
      const session: Session = { name: name.trim(), phone, token: result.token, savedAt: Date.now() }
      saveSession(session)
      onDone(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증에 실패했어요.')
    } finally { setLoading(false) }
  }

  return (
    <div className="ios-app">
      <div className="ios-nav">
        <div className="ios-nav-inner">
          <button className="ios-nav-btn ios-nav-btn-left" type="button" onClick={onBack}>
            <ChevronLeft size={20} />
          </button>
          <span className="ios-nav-title">로그인</span>
          <div style={{ minWidth: 60 }} />
        </div>
      </div>

      <div className="login-page">
        <div className="login-header">
          <div className="login-icon"><KokkokLogo size={48} /></div>
          <h2 className="login-title">본인 확인</h2>
          <p className="login-subtitle">받은 콕콕을 확인하려면<br />본인 인증이 필요해요</p>
          <p className="login-notice">내 번호는 상대방에게 공개되지 않아요.<br />본인 확인 용도로만 사용돼요.</p>
        </div>

        {!codeSent ? (
          <div className="login-form">
            <div className="ios-form-group">
              <div className="ios-form-label">이름</div>
              <input className="ios-form-input" type="text" placeholder="홍길동" value={name} onChange={e => setName(e.target.value)} maxLength={20} autoComplete="name" />
            </div>
            <div className="ios-form-group">
              <div className="ios-form-label">내 휴대폰 번호</div>
              <input className="ios-form-input" type="tel" placeholder="010-0000-0000" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} autoComplete="tel" inputMode="numeric" />
            </div>
            {error && <div className="ios-sheet-status ios-sheet-status-error">{error}</div>}
            <button className="ios-sheet-btn ios-sheet-btn-primary" type="button" disabled={loading} onClick={handleSendCode}>
              {loading ? <><span className="ios-spinner" />전송 중…</> : '인증번호 받기'}
            </button>
          </div>
        ) : (
          <div className="login-form">
            <div className="ios-form-group">
              <div className="ios-form-label">인증번호 6자리</div>
              <input className="ios-form-input" type="text" placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.2em', fontWeight: 600 }} />
            </div>
            {error && <div className="ios-sheet-status ios-sheet-status-error">{error}</div>}
            {success && <div className="ios-sheet-status ios-sheet-status-success">{success}</div>}
            <button className="ios-sheet-btn ios-sheet-btn-primary" type="button" disabled={loading} onClick={handleVerify}>
              {loading ? <><span className="ios-spinner" />확인 중…</> : '확인'}
            </button>
            <button className="ios-sheet-btn ios-sheet-btn-ghost" type="button" disabled={cooldown > 0 || loading} onClick={handleSendCode}>
              {cooldown > 0 ? `재전송 (${cooldown}초)` : '인증번호 다시 받기'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Compose View (iMessage-style sending)
// ═══════════════════════════════════════════════════════════════════════════════
function ComposeView({
  session,
  onDone,
  onCancel,
  onSessionCreated,
}: {
  session: Session | null
  onDone: (matched: boolean) => void
  onCancel: () => void
  onSessionCreated: (s: Session) => void
}) {
  const [targetPhone, setTargetPhone] = useState('')
  const [targetConfirmed, setTargetConfirmed] = useState(false)
  const [relationship, setRelationship] = useState('')
  const [hint, setHint] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [showVerify, setShowVerify] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [delivered, setDelivered] = useState(false)
  const [matched, setMatched] = useState(false)
  // step: 'input' (typing hint) → 'confirm' (preview + yes/no) → 'done'
  const [step, setStep] = useState<'input' | 'confirm' | 'done'>('input')
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function scrollToBottom() {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  // Auto-advance when 11 digits entered
  function handlePhoneChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    setTargetPhone(digits)
    if (digits.length === 11 && isValidPhone(digits)) {
      setTimeout(() => {
        setTargetConfirmed(true)
        setMessages([{ id: 'time', type: 'time', text: nowTimeString() }])
        setTimeout(() => inputRef.current?.focus(), 300)
      }, 200)
    }
  }

  function handleEditPhone() {
    setTargetConfirmed(false)
    setMessages([])
    setRelationship('')
    setHint('')
    setStep('input')
  }

  // Step 1: user presses enter → keep preview card, show confirm below it
  function handleSubmitHint() {
    if (!hint.trim()) return
    setStep('confirm')
    scrollToBottom()
  }

  // Step 2: user confirms "예"
  function handleConfirmSend() {
    if (!session) {
      setShowVerify(true)
    } else {
      doSubmit(session)
    }
  }

  // Step 2 alternative: user cancels
  function handleCancelConfirm() {
    setStep('input')
    setTimeout(() => inputRef.current?.focus(), 200)
  }

  async function doSubmit(sess: Session) {
    setSubmitting(true)
    setShowVerify(false)
    scrollToBottom()
    try {
      const result = await submitKokkok({
        sender_name: sess.name,
        sender_phone: sess.phone,
        target_phone: targetPhone,
        relationship: relationship || undefined,
        hint_text: hint.trim(),
        verification_token: sess.token,
      })
      setDelivered(true)
      setMatched(result.matched)
      setStep('done')

      // Show success popup
      setShowSuccessPopup(true)
      setTimeout(() => {
        setShowSuccessPopup(false)
        onDone(result.matched)
      }, 2000)

      if (result.matched) {
        setMessages(prev => [
          ...prev,
          { id: 'match-sys', type: 'system', text: '매칭 성공!' },
          { id: 'match-msg', type: 'received', text: '서로 같은 마음이에요!\n문자로 상대방 정보를 보내드렸어요.' },
        ])
      }
      scrollToBottom()
    } catch {
      setMessages(prev => [...prev, { id: 'err', type: 'system', text: '전송에 실패했어요. 다시 시도해주세요.' }])
      setStep('input')
    } finally { setSubmitting(false) }
  }

  function handleVerified(sess: Session) {
    onSessionCreated(sess)
    doSubmit(sess)
  }

  const displayPhone = formatPhone(targetPhone)

  return (
    <div className="ios-chat-container">
      {/* ── Nav ──────────────────────────────────────────────────── */}
      <div className="ios-nav">
        <div className="ios-nav-inner">
          <button className="ios-nav-btn ios-nav-btn-left" type="button" onClick={onCancel}>
            {targetConfirmed ? <ChevronLeft /> : '취소'}
          </button>
          <span className="ios-nav-title">새로운 메시지</span>
          <div style={{ minWidth: 60 }} />
        </div>
      </div>

      {/* ── To: field ────────────────────────────────────────────── */}
      <div className="ios-to-bar">
        <span className="ios-to-label">받는 사람:</span>
        {targetConfirmed ? (
          <button type="button" className="ios-to-chip" onClick={step === 'input' ? handleEditPhone : undefined}>
            {displayPhone}
          </button>
        ) : (
          <input
            className="ios-to-input"
            type="tel"
            placeholder="전화번호 입력"
            value={formatPhone(targetPhone)}
            onChange={e => handlePhoneChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && isValidPhone(targetPhone)) {
                e.preventDefault()
                setTargetConfirmed(true)
                setMessages([{ id: 'time', type: 'time', text: nowTimeString() }])
                setTimeout(() => inputRef.current?.focus(), 300)
              }
            }}
            inputMode="numeric"
            autoFocus
          />
        )}
      </div>

      {/* ── Chat area ────────────────────────────────────────────── */}
      <div className="ios-chat-area">
        <div className="ios-chat-spacer" />

        {!targetConfirmed && (
          <div className="compose-guide">
            <div className="compose-guide-icon">💌</div>
            <p className="compose-guide-title">마음을 전할 상대의 번호를 입력하세요</p>
            <p className="compose-guide-desc">콕콕이 대신 익명 메시지를 보내드려요<br />내 번호는 절대 노출되지 않아요</p>
          </div>
        )}

        {/* Live preview card (input & confirm steps) */}
        {targetConfirmed && (step === 'input' || step === 'confirm') && (
          <div className="compose-guide" style={{ paddingBottom: step === 'confirm' ? 0 : 8, paddingTop: 12 }}>
            <p className="compose-guide-desc" style={{ marginBottom: 12 }}>
              상대방에게 이런 메시지가 전달돼요
            </p>
            <div className="compose-preview-card">
              <div className="compose-preview-header">
                <span className="compose-preview-from">콕콕</span>
                <span className="compose-preview-time">지금</span>
              </div>
              <p className="compose-preview-body">
                누군가 당신을 좋아합니다 💌
              </p>
              {relationship && (
                <p className="compose-preview-meta">관계: {relationship}</p>
              )}
              <p className="compose-preview-meta">
                힌트: {hint || '(아래에 힌트를 작성해주세요)'}
              </p>
            </div>

            {/* Confirm question + buttons (centered, below card) */}
            {step === 'confirm' && (
              <div className="compose-confirm-section">
                <p className="compose-confirm-question">이대로 상대방에게 문자를 보내드릴까요?</p>
                <div className="compose-confirm-btns">
                  <button type="button" className="compose-confirm-yes" onClick={handleConfirmSend}>
                    네, 보내주세요!
                  </button>
                  <button type="button" className="compose-confirm-no" onClick={handleCancelConfirm}>
                    다시 작성할게요
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map(msg => {
          if (msg.type === 'time') return <div key={msg.id} className="ios-time-header">{msg.text}</div>
          if (msg.type === 'system') return <div key={msg.id} className="ios-bubble ios-bubble-system">{msg.text}</div>
          if (msg.type === 'received') return <div key={msg.id} className="ios-bubble ios-bubble-received">{msg.text}</div>
          return <div key={msg.id} className="ios-bubble ios-bubble-sent">{msg.text}</div>
        })}

        {submitting && (
          <div className="ios-typing"><div className="ios-typing-dot" /><div className="ios-typing-dot" /><div className="ios-typing-dot" /></div>
        )}
        {delivered && <div className="ios-delivered">전달됨</div>}
        <div ref={chatEndRef} />
      </div>

      {/* ── Bottom: input (only during 'input' step) ─────────────── */}
      {targetConfirmed && step === 'input' && (
        <>
          <div className="compose-section-label">우리 사이는? (선택)</div>
          <div className="ios-rel-bar">
            {RELATIONSHIPS.map(r => (
              <button key={r} type="button" className={`ios-rel-tag ${relationship === r ? 'active' : ''}`} onClick={() => setRelationship(relationship === r ? '' : r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="ios-input-bar">
            <div className="ios-input-wrapper">
              <textarea
                ref={inputRef}
                className="ios-input-field"
                placeholder="상대방에게 당신이 누군지 알려줄 힌트를 적어주세요 (ex. 우리 도서관에서 자주 마주친 사이에요!)"
                value={hint}
                onChange={e => setHint(e.target.value.slice(0, 100))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitHint() } }}
                rows={1}
              />
            </div>
            <button className="ios-send-btn" type="button" disabled={!hint.trim()} onClick={handleSubmitHint}>
              <SendArrow />
            </button>
          </div>
          <div className="compose-char-count">{hint.length}/100</div>
        </>
      )}

      {/* ── Verification Sheet ───────────────────────────────────── */}
      {showVerify && (
        <VerificationSheet
          onVerified={handleVerified}
          onClose={() => {
            setShowVerify(false)
            setStep('confirm')
          }}
        />
      )}

      {/* ── Success Popup ────────────────────────────────────────── */}
      {showSuccessPopup && (
        <div className="compose-success-overlay">
          <div className="compose-success-popup">
            <div className="compose-success-icon">✓</div>
            <p className="compose-success-text">메시지가 성공적으로<br />전송됐습니다!</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Verification Sheet (compose last step)
// ═══════════════════════════════════════════════════════════════════════════════
function VerificationSheet({
  onVerified,
  onClose,
}: {
  onVerified: (session: Session) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCooldown() {
    setCooldown(60)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => { if (prev <= 1) { clearInterval(cooldownRef.current!); return 0 } return prev - 1 })
    }, 1000)
  }

  async function handleSendCode() {
    if (!name.trim()) { setError('이름을 입력해주세요.'); return }
    if (!isValidPhone(phone)) { setError('올바른 휴대폰 번호를 입력해주세요.'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      await sendVerification(phone)
      setCodeSent(true); setSuccess('인증번호가 발송되었어요!'); startCooldown()
    } catch (err) { setError(err instanceof Error ? err.message : '전송에 실패했어요.') }
    finally { setLoading(false) }
  }

  async function handleVerify() {
    if (code.length < 6) { setError('6자리 인증번호를 입력해주세요.'); return }
    setLoading(true); setError('')
    try {
      const result = await verifyCode(phone, code)
      if (!result.verified) { setError(result.error || '인증번호가 틀렸어요.'); return }
      const session: Session = { name: name.trim(), phone, token: result.token, savedAt: Date.now() }
      saveSession(session); onVerified(session)
    } catch (err) { setError(err instanceof Error ? err.message : '인증에 실패했어요.') }
    finally { setLoading(false) }
  }

  return (
    <div className="ios-sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ios-sheet">
        <div className="ios-sheet-handle" />
        <h2 className="ios-sheet-title">본인 확인</h2>
        <p className="ios-sheet-subtitle">메시지를 보내기 전에<br />본인 확인이 필요해요</p>
        <p className="ios-sheet-notice">내 번호는 상대방에게 공개되지 않아요.<br />본인 확인 용도로만 사용돼요.</p>
        {!codeSent ? (
          <>
            <div className="ios-form-group">
              <div className="ios-form-label">이름</div>
              <input className="ios-form-input" type="text" placeholder="홍길동" value={name} onChange={e => setName(e.target.value)} maxLength={20} autoComplete="name" />
            </div>
            <div className="ios-form-group">
              <div className="ios-form-label">내 휴대폰 번호</div>
              <input className="ios-form-input" type="tel" placeholder="010-0000-0000" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} autoComplete="tel" inputMode="numeric" />
            </div>
            {error && <div className="ios-sheet-status ios-sheet-status-error">{error}</div>}
            <button className="ios-sheet-btn ios-sheet-btn-primary" type="button" disabled={loading} onClick={handleSendCode}>
              {loading ? <><span className="ios-spinner" />전송 중…</> : '인증번호 받기'}
            </button>
          </>
        ) : (
          <>
            <div className="ios-form-group">
              <div className="ios-form-label">인증번호 6자리</div>
              <input className="ios-form-input" type="text" placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.2em', fontWeight: 600 }} />
            </div>
            {error && <div className="ios-sheet-status ios-sheet-status-error">{error}</div>}
            {success && <div className="ios-sheet-status ios-sheet-status-success">{success}</div>}
            <button className="ios-sheet-btn ios-sheet-btn-primary" type="button" disabled={loading} onClick={handleVerify}>
              {loading ? <><span className="ios-spinner" />확인 중…</> : '확인'}
            </button>
            <button className="ios-sheet-btn ios-sheet-btn-ghost" type="button" disabled={cooldown > 0 || loading} onClick={handleSendCode}>
              {cooldown > 0 ? `재전송 (${cooldown}초)` : '인증번호 다시 받기'}
            </button>
          </>
        )}
        <button className="ios-sheet-btn ios-sheet-btn-ghost" type="button" onClick={onClose} style={{ marginTop: 8, color: 'var(--ios-label-secondary)' }}>취소</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared components
// ═══════════════════════════════════════════════════════════════════════════════
function ShareButton() {
  const [copied, setCopied] = useState(false)
  const shareUrl = 'https://kokkok-nu.vercel.app'
  async function handleShare() {
    if (navigator.share) { try { await navigator.share({ title: '콕콕', text: '익명으로 마음을 전해보세요 💗 콕콕', url: shareUrl }); return } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* no clipboard */ }
  }
  return (
    <button type="button" className="ios-share-btn" onClick={handleShare}>
      {copied ? '✓ 링크 복사됨!' : (<>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>공유하기
      </>)}
    </button>
  )
}

function FeedbackButton() {
  return (
    <button type="button" className="ios-share-btn" onClick={() => window.open('https://forms.gle/nmvFaiFGKAZU5wp2A', '_blank')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>기능제안
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════
export default function MainPage() {
  const [phase, setPhase] = useState<Phase>('list')
  const [noticeType, setNoticeType] = useState<'received' | 'sent'>('received')
  const [session, setSession] = useState<Session | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const existing = getSession()
    if (existing) setSession(existing)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const pages: Record<Phase, string> = { list: '/', compose: '/compose', login: '/login', notice: '/notice' }
    pageview(pages[phase])
    trackScreen(phase, pages[phase])
  }, [phase, mounted])

  if (!mounted) return <div className="ios-app" style={{ minHeight: '100svh' }} />

  return (
    <>
      {phase === 'list' && (
        <MessagesList
          session={session}
          onCompose={() => setPhase('compose')}
          onLoginRequest={() => setPhase('login')}
          onNotice={(type) => { setNoticeType(type); setPhase('notice') }}
          onLogout={() => { clearSession(); setSession(null) }}
        />
      )}
      {phase === 'compose' && (
        <ComposeView
          session={session}
          onDone={() => setPhase('list')}
          onCancel={() => setPhase('list')}
          onSessionCreated={s => setSession(s)}
        />
      )}
      {phase === 'login' && (
        <LoginPage
          onDone={s => { setSession(s); setPhase('list') }}
          onBack={() => setPhase('list')}
        />
      )}
      {phase === 'notice' && (
        <NoticeView
          type={noticeType}
          onCompose={() => setPhase('compose')}
          onBack={() => setPhase('list')}
        />
      )}
    </>
  )
}
