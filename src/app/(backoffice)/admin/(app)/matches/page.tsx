import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { MatchesView, type MatchRow } from '@/backoffice/views/matches'

export const metadata: Metadata = { title: 'Matches' }
export const dynamic = 'force-dynamic'

export default async function MatchesPage() {
  await requireUser('editor', 'moderator')
  const payload = await payloadClient()
  const res = await payload.find({ collection: 'matches', sort: 'order', pagination: false, depth: 0 })
  const rows: MatchRow[] = res.docs.map((m) => ({
    id: String(m.id),
    sport: m.sport,
    league: m.league || '',
    home: m.home,
    away: m.away,
    status: m.status,
    startsAt: m.startsAt || null,
    minute: m.minute ?? null,
    scoreHome: m.scoreHome ?? null,
    scoreAway: m.scoreAway ?? null,
    oddsHome: m.oddsHome ?? null,
    oddsDraw: m.oddsDraw ?? null,
    oddsAway: m.oddsAway ?? null,
    order: m.order ?? 0,
    active: !!m.active,
  }))
  return <MatchesView rows={rows} />
}
