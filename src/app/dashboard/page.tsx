'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { pageview, trackScreen } from '@/lib/ga'

const IS_DEMO = false // Always use real API

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'kokkok2026'

interface DashboardEntry {
  id: string
  sender_phone_hash: string
  target_phone_hash: string
  hint_text: string | null
  matched: boolean
  created_at: string
}

type Tab = 'overview' | 'entries' | 'daily'
type EntryFilter = 'all' | 'matched' | 'pending' | 'hints'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDay(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })
}

function generateDemoEntries(): DashboardEntry[] {
  const hashes = ['a1b2c3', 'b2c3d4', 'c3d4e5', 'd4e5f6', 'e5f6g7', 'f6g7h8', 'g7h8i9', 'h8i9j0']
  const hints = [
    '매일 급식실에서 마주쳐요',
    '체육시간에 같은 팀이었어요',
    '도서관에서 항상 옆자리에 앉더라',
    null,
    '쉬는 시간에 복도에서 눈 마주쳤어요',
    null,
    '같은 학원 다녀요',
    null,
    '축제 때 같이 준비했어요',
    null,
    '급식 줄에서 자리 양보해줬어요',
    null,
    '수학 시간에 같은 모둠이었어요',
    null,
    '등교할 때 같은 버스 타더라',
    null,
  ]

  const entries: DashboardEntry[] = []
  const now = Date.now()

  for (let i = 0; i < 24; i++) {
    const sIdx = Math.floor(Math.random() * hashes.length)
    let tIdx = sIdx
    while (tIdx === sIdx) tIdx = Math.floor(Math.random() * hashes.length)

    const hoursAgo = Math.floor(Math.random() * 168) // 7일 이내
    const isMatched = Math.random() > 0.7

    entries.push({
      id: String(i + 1),
      sender_phone_hash: `${hashes[sIdx]}...demo`,
      target_phone_hash: `${hashes[tIdx]}...demo`,
      hint_text: hints[i % hints.length],
      matched: isMatched,
      created_at: new Date(now - hoursAgo * 3600000).toISOString(),
    })
  }

  return entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

// ─── Overview Tab ────────────────────────────────────────────────────────────
function OverviewTab({
  entries,
  dailyData,
}: {
  entries: DashboardEntry[]
  dailyData: { date: string; count: number; matches: number }[]
}) {
  const totalEntries = entries.length
  const totalMatches = Math.floor(entries.filter((e) => e.matched).length / 2)
  const uniqueSenders = new Set(entries.map((e) => e.sender_phone_hash)).size
  const uniqueTargets = new Set(entries.map((e) => e.target_phone_hash)).size
  const hintsCount = entries.filter((e) => e.hint_text).length

  const todayStr = new Date().toDateString()
  const todayEntries = entries.filter((e) => new Date(e.created_at).toDateString() === todayStr)
  const todayCount = todayEntries.length
  const todayMatches = Math.floor(todayEntries.filter((e) => e.matched).length / 2)

  const maxCount = Math.max(...dailyData.map((d) => d.count), 1)

  return (
    <>
      {/* Summary stats */}
      <div className="dashboard-stats">
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-num">{totalEntries}</span>
          <span className="dashboard-stat-label">총 콕콕</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-num">{totalMatches}</span>
          <span className="dashboard-stat-label">매칭 성사</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-num">{uniqueSenders}</span>
          <span className="dashboard-stat-label">발신자</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-num">{uniqueTargets}</span>
          <span className="dashboard-stat-label">수신자</span>
        </div>
      </div>

      {/* Today highlight */}
      <div className="dash-today">
        <span className="dash-today-label">오늘</span>
        <div className="dash-today-row">
          <span>콕콕 <strong>{todayCount}</strong>건</span>
          <span className="dash-today-divider">·</span>
          <span>매칭 <strong>{todayMatches}</strong>건</span>
          <span className="dash-today-divider">·</span>
          <span>힌트 <strong>{hintsCount}</strong>개</span>
        </div>
      </div>

      {/* Daily bar chart */}
      <div className="dash-section-title">일별 콕콕 추이 (최근 7일)</div>
      <div className="dash-chart">
        {dailyData.map((d) => (
          <div key={d.date} className="dash-chart-col">
            <div className="dash-chart-bar-wrap">
              {d.matches > 0 && (
                <div
                  className="dash-chart-bar dash-chart-bar-match"
                  style={{ height: `${(d.matches / maxCount) * 100}%` }}
                />
              )}
              <div
                className="dash-chart-bar dash-chart-bar-total"
                style={{ height: `${(d.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="dash-chart-num">{d.count}</span>
            <span className="dash-chart-label">{d.date.slice(d.date.indexOf(' ') + 1)}</span>
          </div>
        ))}
      </div>
      <div className="dash-chart-legend">
        <span><span className="dash-legend-dot dash-legend-total" /> 콕콕</span>
        <span><span className="dash-legend-dot dash-legend-match" /> 매칭</span>
      </div>

      {/* Recent 5 */}
      <div className="dash-section-title">최근 활동</div>
      {entries.slice(0, 5).map((entry) => (
        <div key={entry.id} className={`entry-card ${entry.matched ? 'matched' : ''}`}>
          <div className="dash-entry-header">
            <span className="dash-hash">
              {entry.sender_phone_hash.slice(0, 6)} → {entry.target_phone_hash.slice(0, 6)}
            </span>
            {entry.matched && <span className="match-badge">매칭</span>}
          </div>
          {entry.hint_text && (
            <p className="dash-hint">&ldquo;{entry.hint_text}&rdquo;</p>
          )}
          <p className="entry-meta">{formatDate(entry.created_at)}</p>
        </div>
      ))}
    </>
  )
}

// ─── Entries Tab ─────────────────────────────────────────────────────────────
function EntriesTab({ entries }: { entries: DashboardEntry[] }) {
  const [filter, setFilter] = useState<EntryFilter>('all')

  const filtered = useMemo(() => {
    switch (filter) {
      case 'matched': return entries.filter((e) => e.matched)
      case 'pending': return entries.filter((e) => !e.matched)
      case 'hints': return entries.filter((e) => e.hint_text)
      default: return entries
    }
  }, [entries, filter])

  const filters: { key: EntryFilter; label: string }[] = [
    { key: 'all', label: `전체 (${entries.length})` },
    { key: 'matched', label: `매칭 (${entries.filter((e) => e.matched).length})` },
    { key: 'pending', label: `대기 (${entries.filter((e) => !e.matched).length})` },
    { key: 'hints', label: `힌트 (${entries.filter((e) => e.hint_text).length})` },
  ]

  return (
    <>
      {/* Filter bar */}
      <div className="dash-filter-bar">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`dash-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="empty-state">해당하는 내역이 없어요</div>
      ) : (
        filtered.map((entry) => (
          <div key={entry.id} className={`entry-card ${entry.matched ? 'matched' : ''}`}>
            <div className="dash-entry-header">
              <span className="dash-hash">
                {entry.sender_phone_hash.slice(0, 6)} → {entry.target_phone_hash.slice(0, 6)}
              </span>
              <span className={`dash-status ${entry.matched ? 'dash-status-matched' : 'dash-status-pending'}`}>
                {entry.matched ? '매칭 완료' : '대기 중'}
              </span>
            </div>
            {entry.hint_text && (
              <p className="dash-hint">&ldquo;{entry.hint_text}&rdquo;</p>
            )}
            <p className="entry-meta">{formatDate(entry.created_at)}</p>
          </div>
        ))
      )}
    </>
  )
}

// ─── Daily Tab ───────────────────────────────────────────────────────────────
function DailyTab({
  entries,
  dailyData,
}: {
  entries: DashboardEntry[]
  dailyData: { date: string; count: number; matches: number }[]
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const dailyEntries = useMemo(() => {
    if (!selectedDate) return []
    return entries.filter((e) => formatDay(e.created_at) === selectedDate)
  }, [entries, selectedDate])

  return (
    <>
      <div className="dash-section-title">날짜를 선택하면 상세 내역을 볼 수 있어요</div>

      {dailyData.map((d) => (
        <button
          key={d.date}
          type="button"
          className={`dash-daily-row ${selectedDate === d.date ? 'active' : ''}`}
          onClick={() => setSelectedDate(selectedDate === d.date ? null : d.date)}
        >
          <span className="dash-daily-date">{d.date}</span>
          <div className="dash-daily-nums">
            <span>콕콕 <strong>{d.count}</strong></span>
            <span>매칭 <strong>{d.matches}</strong></span>
          </div>
        </button>
      ))}

      {selectedDate && (
        <div className="dash-daily-detail">
          <div className="dash-section-title">{selectedDate} 상세</div>
          {dailyEntries.length === 0 ? (
            <div className="empty-state">내역이 없어요</div>
          ) : (
            dailyEntries.map((entry) => (
              <div key={entry.id} className={`entry-card ${entry.matched ? 'matched' : ''}`}>
                <div className="dash-entry-header">
                  <span className="dash-hash">
                    {entry.sender_phone_hash.slice(0, 6)} → {entry.target_phone_hash.slice(0, 6)}
                  </span>
                  {entry.matched && <span className="match-badge">매칭</span>}
                </div>
                {entry.hint_text && (
                  <p className="dash-hint">&ldquo;{entry.hint_text}&rdquo;</p>
                )}
                <p className="entry-meta">{formatDate(entry.created_at)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [entries, setEntries] = useState<DashboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setAuthed(true)
      setError('')
    } else {
      setError('비밀번호가 틀렸습니다.')
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)

    if (IS_DEMO) {
      setEntries(generateDemoEntries())
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/get-dashboard')
      const data = await res.json()
      setEntries((data.entries as DashboardEntry[]) || [])
    } catch (err) {
      console.error('Failed to load dashboard data', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    pageview('/dashboard')
    trackScreen('dashboard', '/dashboard')
  }, [])

  useEffect(() => {
    if (authed) loadData()
  }, [authed, loadData])

  // Build daily aggregation
  const dailyData = useMemo(() => {
    const map = new Map<string, { count: number; matches: number }>()

    // Init last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = formatDay(d.toISOString())
      map.set(key, { count: 0, matches: 0 })
    }

    entries.forEach((e) => {
      const key = formatDay(e.created_at)
      if (map.has(key)) {
        const cur = map.get(key)!
        cur.count++
        if (e.matched) cur.matches++
      }
    })

    return Array.from(map.entries()).map(([date, data]) => ({
      date,
      count: data.count,
      matches: Math.floor(data.matches / 2),
    }))
  }, [entries])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: '개요' },
    { key: 'entries', label: '전체 내역' },
    { key: 'daily', label: '일별 현황' },
  ]

  if (!authed) {
    return (
      <>
        <div className="bg-animated" aria-hidden="true" />
        <main className="app-shell">
          <div className="card">
            <div className="step text-center">
              <h1 className="title text-2xl" style={{ marginBottom: 8 }}>관리자 대시보드</h1>
              <p className="subtitle" style={{ marginBottom: 24 }}>비밀번호를 입력해주세요</p>
              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  className="input"
                  type="password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                {error && (
                  <div className="status-msg error">
                    <span>!</span>
                    <span>{error}</span>
                  </div>
                )}
                <button className="btn-primary" type="submit">로그인</button>
              </form>
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <div className="bg-animated" aria-hidden="true" />
      <main className="dash-shell">
        <div className="dash-container">
          {/* Header */}
          <div className="dash-header">
            <h1 className="dash-title">관리자 대시보드</h1>
            <button className="btn-ghost" type="button" onClick={() => setAuthed(false)}>
              로그아웃
            </button>
          </div>

          {/* Tab bar */}
          <div className="tab-bar" style={{ marginBottom: 20 }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tab-btn ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="empty-state">
              <span className="spinner" /> 불러오는 중...
            </div>
          ) : (
            <>
              {tab === 'overview' && <OverviewTab entries={entries} dailyData={dailyData} />}
              {tab === 'entries' && <EntriesTab entries={entries} />}
              {tab === 'daily' && <DailyTab entries={entries} dailyData={dailyData} />}
            </>
          )}
        </div>
      </main>
    </>
  )
}
