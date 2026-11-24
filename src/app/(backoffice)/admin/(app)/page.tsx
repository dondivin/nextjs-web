import type { Metadata } from 'next'
import Link from 'next/link'
import { format, formatDistanceToNowStrict, startOfDay, subDays } from 'date-fns'
import { ArrowRight, Flag, Languages, MessagesSquare, Palette, ShieldCheck, Trophy } from 'lucide-react'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/backoffice/components/ui/card'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Progress } from '@/backoffice/components/ui/progress'
import { ActivityChart } from '@/backoffice/views/activity-chart'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser()
  const { denied } = await searchParams
  const payload = await payloadClient()
  const now = new Date()
  const days = Array.from({ length: 14 }, (_, i) => startOfDay(subDays(now, 13 - i)))

  const [partners, matches, members, newMembers, reports, reportList, langs, translations, perDay] = await Promise.all([
    payload.find({ collection: 'partners', sort: 'order', pagination: false, depth: 0, select: { name: true, active: true, colors: true, promoCode: true, signupUrl: true } }),
    payload.find({ collection: 'matches', where: { active: { equals: true } }, sort: 'order', pagination: false, depth: 0 }),
    payload.count({ collection: 'members' }),
    payload.count({ collection: 'members', where: { createdAt: { greater_than: subDays(now, 7).toISOString() } } }),
    payload.count({ collection: 'chat-reports', where: { status: { equals: 'open' } } }),
    payload.find({ collection: 'chat-reports', where: { status: { equals: 'open' } }, sort: '-createdAt', limit: 5, depth: 1 }),
    payload.find({ collection: 'languages', sort: 'order', pagination: false, depth: 0 }),
    payload.find({ collection: 'translations', pagination: false, depth: 0, select: { values: true } }),
    Promise.all(days.map((d, i) => payload.count({ collection: 'chat-messages', where: { and: [{ createdAt: { greater_than_equal: d.toISOString() } }, { createdAt: { less_than: (days[i + 1] || now).toISOString() } }] } }))),
  ])

  const live = matches.docs.filter((m) => m.status === 'live')
  const upcoming = matches.docs.filter((m) => m.status === 'upcoming')
  const chart = days.map((d, i) => ({ day: format(d, 'd MMM'), messages: perDay[i].totalDocs }))
  const today = perDay[perDay.length - 1].totalDocs
  const totalKeys = translations.docs.length
  const coverage = langs.docs.map((l) => {
    const done = translations.docs.filter((t) => ((t.values || []) as { locale: string; value?: string | null }[]).some((v) => v.locale === l.code && (v.value || '').trim())).length
    return { code: l.code, name: l.nativeName, enabled: !!l.enabled, pct: totalKeys ? Math.round((done / totalKeys) * 100) : 0, missing: totalKeys - done }
  })
  const partnerIssues = partners.docs.filter((p) => p.active && (!p.promoCode || !p.signupUrl))
  const hello = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="flex flex-col gap-6">
      {denied && <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">Your account doesn’t have access to that page. Ask the owner to add the right role.</div>}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{hello}{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-muted-foreground">Here’s what’s happening on OddsClub today.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Palette} label="Active partners" value={partners.docs.filter((p) => p.active).length} sub={`${partners.docs.length} in total`} href="/admin/partners" />
        <Kpi icon={Trophy} label="Live matches" value={live.length} sub={`${upcoming.length} upcoming`} href="/cms/collections/matches" />
        <Kpi icon={MessagesSquare} label="Messages today" value={today} sub={`${members.totalDocs} members · +${newMembers.totalDocs} this week`} href="/admin/moderation" />
        <Kpi icon={Flag} label="Open reports" value={reports.totalDocs} sub={reports.totalDocs ? 'Needs review' : 'All clear'} href="/admin/moderation" tone={reports.totalDocs ? 'danger' : 'ok'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Chat activity</CardTitle><CardDescription>Messages per day, last 14 days</CardDescription></CardHeader>
          <CardContent><ActivityChart data={chart} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Needs attention</CardTitle><CardDescription>Latest reports</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link href="/admin/moderation">Open<ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {reportList.docs.length === 0 && <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4 text-success" />No open reports.</div>}
            {reportList.docs.map((r) => (
              <div key={r.id} className="rounded-md border p-3">
                <p className="line-clamp-2 text-sm">{r.messageText || 'Reported message'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{typeof r.messageAuthor === 'object' && r.messageAuthor ? r.messageAuthor.displayName : 'Member'} · {formatDistanceToNowStrict(new Date(r.createdAt), { addSuffix: true })}</p>
              </div>
            ))}
            {partnerIssues.map((p) => (
              <Link key={p.id} href={'/admin/partners/' + p.id} className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm hover:bg-warning/15">
                <b>{p.name}</b> is live but has no {!p.promoCode ? 'promo code' : 'sign-up link'} yet.
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Matches</CardTitle><CardDescription>Live and next up on the board</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><a href="/cms/collections/matches">Manage<ArrowRight /></a></Button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {[...live, ...upcoming].slice(0, 6).map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                {m.status === 'live' ? <Badge variant="destructive">LIVE {m.minute ? `${m.minute}'` : ''}</Badge> : <Badge variant="outline">{m.startsAt ? format(new Date(m.startsAt), 'HH:mm') : 'Soon'}</Badge>}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.home} v {m.away}</span>
                <span className="hidden text-xs capitalize text-muted-foreground sm:inline">{m.sport}{m.league ? ` · ${m.league}` : ''}</span>
                {m.status === 'live' && <span className="font-mono text-sm tabular-nums">{m.scoreHome ?? 0}–{m.scoreAway ?? 0}</span>}
              </div>
            ))}
            {!live.length && !upcoming.length && <p className="py-4 text-sm text-muted-foreground">No live or upcoming matches.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Translations</CardTitle><CardDescription>{totalKeys} texts per language</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link href="/admin/translations">Open<ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {coverage.map((c) => (
              <div key={c.code}>
                <div className="mb-1.5 flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Languages className="size-3.5 text-muted-foreground" />{c.name}{!c.enabled && <Badge variant="outline">Hidden</Badge>}</span><span className="tabular-nums text-muted-foreground">{c.pct}%</span></div>
                <Progress value={c.pct} className="h-2" />
                {c.missing > 0 && <p className="mt-1 text-xs text-muted-foreground">{c.missing} missing</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Partners</CardTitle><CardDescription>What visitors can switch between</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {partners.docs.map((p) => (
            <Link key={p.id} href={'/admin/partners/' + p.id} className="flex items-center gap-3 rounded-lg border p-2 pr-4 hover:bg-accent/50">
              <span className="flex size-9 items-center justify-center rounded-md text-xs font-bold" style={{ background: p.colors?.cta, color: p.colors?.ink }}>{p.name.slice(0, 2).toUpperCase()}</span>
              <span className="text-sm font-medium">{p.name}</span>
              <Badge variant={p.active ? 'outline' : 'secondary'}>{p.active ? 'Live' : 'Hidden'}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, href, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; sub: string; href: string; tone?: 'danger' | 'ok' }) {
  return (
    <Link href={href} className="group rounded-xl border bg-card p-5 shadow-xs transition-colors hover:bg-accent/40">
      <div className="flex items-center justify-between text-sm text-muted-foreground">{label}<Icon className={'size-4 ' + (tone === 'danger' ? 'text-destructive' : '')} /></div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className={'mt-1 text-xs ' + (tone === 'danger' ? 'text-destructive' : 'text-muted-foreground')}>{sub}</div>
    </Link>
  )
}
