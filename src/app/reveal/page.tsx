'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getReveal, type RevealData } from '@/lib/api'
import { pageview, trackScreen } from '@/lib/ga'

// ─── Icons ────────────────────────────────────────────────────────────────────
function ChevronLeft({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ShareButton() {
  const [copied, setCopied] = useState(false)
  const shareUrl = 'https://kokkok-nu.vercel.app'
  const shareText = '익명으로 마음을 전해보세요 💗 콕콕'

  async function handleShare() {
    if (navigator.share) {
      try { await navigator.share({ title: '콕콕', text: shareText, url: shareUrl }); return } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* no clipboard */ }
  }

  return (
    <button type="button" className="ios-share-btn" onClick={handleShare}>
      {copied ? '✓ 링크 복사됨!' : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          공유하기
        </>
      )}
    </button>
  )
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingView() {
  return (
    <div className="ios-chat-area" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="ios-typing">
        <div className="ios-typing-dot" />
        <div className="ios-typing-dot" />
        <div className="ios-typing-dot" />
      </div>
    </div>
  )
}

// ─── Error ────────────────────────────────────────────────────────────────────
function ErrorView({ message }: { message: string }) {
  return (
    <div className="ios-chat-area">
      <div className="ios-chat-spacer" />
      <div className="ios-time-header">오류</div>
      <div className="ios-bubble ios-bubble-received">
        {message}
      </div>
      <div style={{ alignSelf: 'center', marginTop: 24 }}>
        <Link
          href="/"
          className="ios-share-btn"
          style={{ textDecoration: 'none', display: 'inline-flex', padding: '12px 24px', fontSize: 15, fontWeight: 600 }}
        >
          콕콕 시작하기
        </Link>
      </div>
    </div>
  )
}

// ─── Matched View ─────────────────────────────────────────────────────────────
function MatchedView({ data }: { data: RevealData }) {
  const isSender = data.role === 'sender'
  const bubbleClass = isSender ? 'ios-bubble ios-bubble-sent' : 'ios-bubble ios-bubble-received'

  return (
    <div className="ios-chat-area">
      <div className="ios-chat-spacer" />

      <div className="ios-time-header">콕콕 매칭</div>

      <div className={bubbleClass}>
        매칭됐어요! 💗
      </div>

      <div className={bubbleClass}>
        서로 같은 마음이에요!
      </div>

      <div className={bubbleClass} style={{ lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>상대방 정보</div>
        <div>이름: {data.partner_name}</div>
        {data.partner_phone && <div>연락처: <span style={{ color: 'var(--ios-blue)' }}>{data.partner_phone}</span></div>}
      </div>

      {data.hint_text && (
        <div className={bubbleClass}>
          💭 &ldquo;{data.hint_text}&rdquo;
        </div>
      )}

      <div className="ios-delivered" style={{ textAlign: isSender ? 'right' : 'left' }}>지금</div>

      <div style={{ alignSelf: 'center', marginTop: 24 }}>
        <Link
          href="/"
          className="ios-share-btn"
          style={{ textDecoration: 'none', display: 'inline-flex', padding: '12px 24px', fontSize: 15, fontWeight: 600 }}
        >
          {isSender ? '돌아가기' : '나도 콕콕하러 가기'}
        </Link>
      </div>
    </div>
  )
}

// ─── Not Matched View ─────────────────────────────────────────────────────────
function NotMatchedView({ data }: { data: RevealData }) {
  const isSender = data.role === 'sender'
  const bubbleClass = isSender ? 'ios-bubble ios-bubble-sent' : 'ios-bubble ios-bubble-received'

  return (
    <div className="ios-chat-area">
      <div className="ios-chat-spacer" />

      <div className="ios-time-header">콕콕</div>

      <div className={bubbleClass} style={{ fontSize: 40, background: 'none', padding: '4px 0' }}>
        {isSender ? '📤' : '💌'}
      </div>

      {isSender ? (
        <>
          <div className={bubbleClass}>
            {data.target_phone_masked || '상대방'}에게 콕콕을 보냈어요
          </div>

          <div className={bubbleClass}>
            아직 매칭 대기 중이에요.{'\n'}상대방도 콕콕을 보내면 매칭돼요!
          </div>

          {data.hint_text && (
            <div className={bubbleClass}>
              💭 내가 남긴 힌트: &ldquo;{data.hint_text}&rdquo;
            </div>
          )}

          <div className="ios-delivered" style={{ textAlign: 'right' }}>지금</div>
        </>
      ) : (
        <>
          <div className={bubbleClass}>
            누군가 당신을 좋아해요
          </div>

          <div className={bubbleClass}>
            아직 상대방이 누군지 알 수 없어요.{'\n'}상대방도 당신에게 콕콕을 보내면 서로 연결돼요!
          </div>

          {data.hint_text && (
            <>
              <div className={bubbleClass}>
                💭 힌트: &ldquo;{data.hint_text}&rdquo;
              </div>
              <div className="ios-bubble ios-bubble-system">
                혹시 누군지 떠오르나요? 👀
              </div>
            </>
          )}

          <div className="ios-delivered" style={{ textAlign: 'left' }}>지금</div>
        </>
      )}

      <div className="ios-bubble ios-bubble-system" style={{ marginTop: 16 }}>
        콕콕에서 같은 사람에게 마음을 전하면{'\n'}매칭이 성사돼요!
      </div>

      <div style={{ alignSelf: 'center', marginTop: 16 }}>
        <Link
          href="/"
          className="ios-share-btn"
          style={{ textDecoration: 'none', display: 'inline-flex', padding: '12px 24px', fontSize: 15, fontWeight: 600 }}
        >
          {isSender ? '돌아가기' : '나도 콕콕하러 가기 💗'}
        </Link>
      </div>
    </div>
  )
}

// ─── Inner component ──────────────────────────────────────────────────────────
function RevealContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('t')
  const role = searchParams.get('role') || undefined

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RevealData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    pageview('/reveal')
    trackScreen('reveal', '/reveal')
  }, [])

  useEffect(() => {
    if (!token) {
      setError('올바르지 않은 링크예요.')
      setLoading(false)
      return
    }

    getReveal(token, role)
      .then(result => {
        if (result.error) {
          setError('링크가 만료되었거나 존재하지 않아요.')
        } else {
          setData(result)
        }
      })
      .catch(() => {
        setError('정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [token, role])

  if (loading) return <LoadingView />
  if (error) return <ErrorView message={error} />
  if (!data) return <ErrorView message="정보를 찾을 수 없어요." />

  return data.matched ? <MatchedView data={data} /> : <NotMatchedView data={data} />
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RevealPage() {
  return (
    <div className="ios-app">
      <div className="ios-chat-container">
        {/* Nav */}
        <div className="ios-chat-nav">
          <div className="ios-chat-nav-inner">
            <Link href="/" className="ios-chat-nav-back" style={{ textDecoration: 'none' }}>
              <ChevronLeft />
            </Link>
            <div className="ios-chat-nav-contact">
              <div className="ios-avatar ios-avatar-kokkok ios-avatar-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="rvlGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fff" /><stop offset="100%" stopColor="#ffe0e8" /></linearGradient></defs><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="url(#rvlGrad)" /></svg>
            </div>
              <span className="ios-chat-nav-name">콕콕</span>
            </div>
            <div className="ios-chat-nav-spacer" />
          </div>
        </div>

        <Suspense fallback={<LoadingView />}>
          <RevealContent />
        </Suspense>

        <div className="ios-share-footer">
          <ShareButton />
        </div>
      </div>
    </div>
  )
}
