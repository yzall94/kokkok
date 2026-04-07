'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getReveal, type RevealData } from '@/lib/api'

// ─── HeartIcon (inline, no import needed across app boundary) ─────────────────
function HeartIcon({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="heartGradReveal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF5C8A" />
          <stop offset="100%" stopColor="#FF7A6E" />
        </linearGradient>
      </defs>
      <path
        d="M16 27.5C16 27.5 3 19.5 3 10.5C3 7.46 5.46 5 8.5 5C10.74 5 12.72 6.31 13.8 8.25C14.5 7 15.72 5 16 5C16.28 5 17.5 7 18.2 8.25C19.28 6.31 21.26 5 23.5 5C26.54 5 29 7.46 29 10.5C29 19.5 16 27.5 16 27.5Z"
        fill="url(#heartGradReveal)"
      />
    </svg>
  )
}

function Particles() {
  const particles = [
    { id: 1, size: 80, left: 10, delay: 0, duration: 18 },
    { id: 2, size: 50, left: 75, delay: 5, duration: 22 },
    { id: 3, size: 100, left: 45, delay: 3, duration: 16 },
    { id: 4, size: 60, left: 25, delay: 8, duration: 20 },
    { id: 5, size: 40, left: 85, delay: 1, duration: 25 },
    { id: 6, size: 70, left: 60, delay: 6, duration: 19 },
  ]

  return (
    <div className="particles" aria-hidden="true">
      {particles.map((p) => (
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

// ─── Loading state ────────────────────────────────────────────────────────────
function LoadingView() {
  return (
    <div className="step text-center">
      <div className="mb-6">
        <HeartIcon size={48} className="heart-icon mx-auto mb-4 opacity-50" />
        <p style={{ color: 'var(--text-muted)' }}>
          <span className="spinner" />
          확인하는 중…
        </p>
      </div>
    </div>
  )
}

// ─── Error / not found state ──────────────────────────────────────────────────
function ErrorView({ message }: { message: string }) {
  return (
    <div className="step text-center">
      <div className="step step-delay-1 mb-6">
        <div
          style={{
            fontSize: '3rem',
            marginBottom: '16px',
            filter: 'grayscale(1) opacity(0.5)',
          }}
        >
          💔
        </div>
        <h2 className="title text-xl mb-2">링크를 확인해주세요</h2>
        <p className="subtitle">{message}</p>
      </div>

      <div className="step step-delay-2">
        <Link
          href="/"
          className="btn-primary"
          style={{
            display: 'inline-block',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          콕콕 시작하기
        </Link>
      </div>
    </div>
  )
}

// ─── Matched view ─────────────────────────────────────────────────────────────
function MatchedView({ data }: { data: RevealData }) {
  return (
    <div className="step text-center">
      <div className="step step-delay-1 mb-8">
        <HeartIcon size={80} className="heart-icon mx-auto mb-4" />
        <h1 className="title gradient-text text-3xl mb-2">매칭됐어요! 💗</h1>
        <p className="subtitle">서로 같은 마음이에요!</p>
      </div>

      <div
        className="entry-card matched step step-delay-2 text-left"
        style={{ marginBottom: '16px' }}
      >
        <p className="section-label mb-3">상대방 정보</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>이름</span>
            <span
              style={{
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '1.1rem',
              }}
            >
              {data.partner_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>연락처</span>
            <span
              style={{
                color: 'var(--accent)',
                fontWeight: 600,
                fontSize: '1.1rem',
                letterSpacing: '0.02em',
              }}
            >
              {data.partner_phone}
            </span>
          </div>
        </div>
      </div>

      {data.hint_text && (
        <div className="entry-card step step-delay-3 text-left">
          <p className="section-label mb-2">남긴 힌트</p>
          <p
            className="text-sm"
            style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}
          >
            &ldquo;{data.hint_text}&rdquo;
          </p>
        </div>
      )}

      <div className="step step-delay-4 mt-6">
        <Link
          href="/"
          className="btn-secondary"
          style={{
            display: 'block',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          나도 콕콕하러 가기
        </Link>
      </div>
    </div>
  )
}

// ─── Not matched view ─────────────────────────────────────────────────────────
function NotMatchedView({ data }: { data: RevealData }) {
  return (
    <div className="step text-center">
      <div className="step step-delay-1 mb-6">
        <div style={{ fontSize: '4rem', marginBottom: '16px' }}>💌</div>
        <h1 className="title text-2xl mb-2">누군가 당신을 좋아해요</h1>
        <p className="subtitle">
          아직 상대방이 누군지 알 수 없어요.
          <br />
          상대방도 당신에게 콕콕을 보내면 연결돼요!
        </p>
      </div>

      {data.hint_text && (
        <div className="entry-card step step-delay-2 text-left" style={{ marginBottom: '16px' }}>
          <p className="section-label mb-2">남긴 힌트</p>
          <p
            className="text-sm"
            style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}
          >
            &ldquo;{data.hint_text}&rdquo;
          </p>
          <p className="entry-meta" style={{ marginTop: '8px' }}>
            혹시 누군지 떠오르나요? 💭
          </p>
        </div>
      )}

      <div className="step step-delay-3 mt-2">
        <div
          className="status-msg"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
          }}
        >
          <span>💡</span>
          <span>
            콕콕에 가입해서 같은 사람에게 마음을 전하면 매칭이 성사돼요!
          </span>
        </div>
      </div>

      <div className="step step-delay-4 mt-6">
        <Link
          href="/"
          className="btn-primary"
          style={{
            display: 'block',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          나도 콕콕하러 가기 💗
        </Link>
      </div>
    </div>
  )
}

// ─── Inner component that uses useSearchParams ────────────────────────────────
function RevealContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('t')

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RevealData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('올바르지 않은 링크예요.')
      setLoading(false)
      return
    }

    getReveal(token)
      .then((result) => {
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
  }, [token])

  if (loading) return <LoadingView />
  if (error) return <ErrorView message={error} />
  if (!data) return <ErrorView message="정보를 찾을 수 없어요." />

  return data.matched ? <MatchedView data={data} /> : <NotMatchedView data={data} />
}

// ─── Page export ──────────────────────────────────────────────────────────────
export default function RevealPage() {
  return (
    <>
      <div className="bg-animated" aria-hidden="true" />
      <Particles />

      <main className="app-shell">
        <div className="card">
          <Suspense fallback={<LoadingView />}>
            <RevealContent />
          </Suspense>
        </div>
      </main>
    </>
  )
}
