import { NextResponse } from 'next/server'
import { execute, isConfigured } from '@/lib/turso'

const CAL_A = parseInt(process.env.NEXT_PUBLIC_STATS_CAL_A || '10', 10)
const CAL_B = parseInt(process.env.NEXT_PUBLIC_STATS_CAL_B || '3', 10)

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ kokkoks: 3 + CAL_A, couples: 1 + CAL_B })
  }

  try {
    const totalRes = await execute('SELECT COUNT(*) as cnt FROM kokkok_entries')
    const matchedRes = await execute('SELECT COUNT(*) as cnt FROM kokkok_entries WHERE matched = 1')

    const total = ((totalRes.rows[0]?.cnt as number) || 0) + CAL_A
    const couples = Math.floor(((matchedRes.rows[0]?.cnt as number) || 0) / 2) + CAL_B

    return NextResponse.json({ kokkoks: total, couples })
  } catch (error) {
    console.error('[get-stats] error:', error)
    return NextResponse.json({ kokkoks: CAL_A, couples: CAL_B })
  }
}
