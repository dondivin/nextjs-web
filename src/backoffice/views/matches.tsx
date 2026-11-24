'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2, Trophy } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { DataTable, type Col } from '@/backoffice/components/data-table'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { Switch } from '@/backoffice/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/backoffice/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/backoffice/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/backoffice/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { SPORT_OPTIONS } from '@/lib/options'
import { matchSchema, type MatchForm } from '@/backoffice/lib/forms'
import { deleteMatch, saveMatch, setMatchActive } from '@/backoffice/actions/content'

export type MatchRow = MatchForm & { id: string }

const sportLabel = (v: string) => SPORT_OPTIONS.find((s) => s.value === v)?.label || v
const toLocal = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '')
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)
const numOrNull = (v: unknown) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))
const odd = (n: number | null) => (n ? n.toFixed(2) : '—')

const EMPTY: MatchForm = {
  sport: 'football', league: '', home: '', away: '', status: 'upcoming', startsAt: null, minute: null, scoreHome: null, scoreAway: null,
  oddsHome: null, oddsDraw: null, oddsAway: null, order: 0, active: true,
}

function StatusCell({ m }: { m: MatchRow }) {
  if (m.status === 'live')
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive">Live{m.minute != null ? ` ${m.minute}’` : ''}</Badge>
        <span className="font-mono text-sm font-semibold">{m.scoreHome ?? 0} – {m.scoreAway ?? 0}</span>
      </div>
    )
  if (m.status === 'ft')
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Full time</Badge>
        <span className="font-mono text-sm">{m.scoreHome ?? 0} – {m.scoreAway ?? 0}</span>
      </div>
    )
  return <span className="text-sm text-muted-foreground">{m.startsAt ? format(new Date(m.startsAt), 'EEE d MMM, HH:mm') : 'Upcoming · no time set'}</span>
}

export function MatchesView({ rows }: { rows: MatchRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<MatchRow | 'new' | null>(null)
  const [confirm, setConfirm] = useState<MatchRow | null>(null)

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const r = await fn()
      if (r.ok) { toast.success(done); router.refresh() } else toast.error(r.error)
    })
  }

  const cols: Col<MatchRow>[] = useMemo(() => [
    {
      id: 'match', header: 'Match', accessorFn: (m) => `${m.home} ${m.away} ${m.league}`,
      cell: ({ row: { original: m } }) => (
        <button type="button" className="text-left" onClick={() => setEditing(m)}>
          <div className="text-sm font-medium">{m.home} <span className="text-muted-foreground">v</span> {m.away}</div>
          <div className="text-xs text-muted-foreground">{sportLabel(m.sport)}{m.league ? ` · ${m.league}` : ''}</div>
        </button>
      ),
    },
    { id: 'status', header: 'Status', accessorFn: (m) => m.status + (m.startsAt || ''), size: 230, cell: ({ row: { original: m } }) => <StatusCell m={m} /> },
    {
      id: 'odds', header: 'Odds 1 · X · 2', enableSorting: false, size: 170,
      cell: ({ row: { original: m } }) => <span className="font-mono text-sm">{odd(m.oddsHome)} · {m.oddsDraw ? odd(m.oddsDraw) : '—'} · {odd(m.oddsAway)}</span>,
    },
    { id: 'order', header: 'Order', accessorFn: (m) => m.order, size: 80, cell: ({ row: { original: m } }) => <span className="text-sm text-muted-foreground">{m.order}</span> },
    {
      id: 'active', header: 'On the site', accessorFn: (m) => (m.active ? 1 : 0), size: 110,
      cell: ({ row: { original: m } }) => (
        <Switch checked={m.active} disabled={pending} aria-label={`Show ${m.home} v ${m.away} on the site`} onCheckedChange={(v) => act(() => setMatchActive(m.id, v), v ? 'Shown on the site' : 'Hidden from the site')} />
      ),
    },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, size: 60,
      cell: ({ row: { original: m } }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.home} v ${m.away}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(m)}><Pencil />Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(m)}><Trash2 />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const live = rows.filter((r) => r.active && r.status === 'live').length
  return (
    <>
      <PageHeader title="Matches" description={`Shown on the board and the 3D phone, each with its own chat room. ${live ? `${live} live now. ` : ''}Changes appear on the site instantly.`}>
        <Button onClick={() => setEditing('new')}><Plus />Add match</Button>
      </PageHeader>
      <DataTable columns={cols} data={rows} searchPlaceholder="Search teams or leagues" empty={<EmptyState icon={Trophy} title="No matches yet">Add the first match for the board.</EmptyState>} />

      <MatchSheet key={editing === 'new' ? 'new' : editing?.id || 'none'} match={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh() }} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.home} v {confirm?.away}?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from the board and the room list. Its chat messages stay in the database. To keep it but hide it, switch “On the site” off instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) act(() => deleteMatch(confirm.id), 'Match deleted'); setConfirm(null) }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function MatchSheet({ match, onClose, onSaved }: { match: MatchRow | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [pending, start] = useTransition()
  const initial = match && match !== 'new' ? match : EMPTY
  const form = useForm<MatchForm>({ resolver: zodResolver(matchSchema), defaultValues: initial })
  const { register, control, handleSubmit, formState } = form
  const status = useWatch({ control, name: 'status' })
  const e = formState.errors
  const numField = { setValueAs: numOrNull }

  function onSubmit(d: MatchForm) {
    start(async () => {
      const r = await saveMatch(match && match !== 'new' ? match.id : null, d)
      if (r.ok) { toast.success(match === 'new' ? 'Match added' : 'Match saved'); onSaved() } else toast.error(r.error)
    })
  }

  return (
    <Sheet open={!!match} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit, () => toast.error('Some fields need fixing'))} className="flex min-h-full flex-col" noValidate>
          <SheetHeader>
            <SheetTitle>{match === 'new' ? 'Add match' : 'Edit match'}</SheetTitle>
            <SheetDescription>Teams, kick-off, live score and odds.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Sport</Label>
                <Controller control={control} name="sport" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{SPORT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-league">League</Label>
                <Input id="m-league" placeholder="e.g. Premier League" {...register('league')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="m-home">Home</Label>
                <Input id="m-home" aria-invalid={!!e.home} {...register('home')} />
                {e.home && <p className="text-xs text-destructive">{e.home.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-away">Away</Label>
                <Input id="m-away" aria-invalid={!!e.away} {...register('away')} />
                {e.away && <p className="text-xs text-destructive">{e.away.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Controller control={control} name="status" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="ft">Full time</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-start">Kick-off</Label>
                <Controller control={control} name="startsAt" render={({ field }) => (
                  <Input id="m-start" type="datetime-local" value={toLocal(field.value)} onChange={(ev) => field.onChange(fromLocal(ev.target.value))} />
                )} />
              </div>
            </div>
            {status !== 'upcoming' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="m-sh">Home score</Label>
                  <Input id="m-sh" type="number" min={0} inputMode="numeric" {...register('scoreHome', numField)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="m-sa">Away score</Label>
                  <Input id="m-sa" type="number" min={0} inputMode="numeric" {...register('scoreAway', numField)} />
                </div>
                {status === 'live' && (
                  <div className="grid gap-2">
                    <Label htmlFor="m-min">Minute</Label>
                    <Input id="m-min" type="number" min={0} inputMode="numeric" {...register('minute', numField)} />
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label>Odds</Label>
              <div className="grid grid-cols-3 gap-3">
                {([['oddsHome', '1 (home)'], ['oddsDraw', 'X (draw)'], ['oddsAway', '2 (away)']] as const).map(([k, l]) => (
                  <div key={k} className="grid gap-1">
                    <Input type="number" step="0.01" min={1} inputMode="decimal" aria-label={l} placeholder={l} aria-invalid={!!e[k]} {...register(k, numField)} />
                    {e[k] && <p className="text-xs text-destructive">{e[k]?.message}</p>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Leave X empty for sports without a draw (tennis, basketball…).</p>
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor="m-order">Order</Label>
                <Input id="m-order" type="number" inputMode="numeric" {...register('order', { setValueAs: (v) => Number(v) || 0 })} />
              </div>
              <Controller control={control} name="active" render={({ field }) => (
                <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} />On the site</label>
              )} />
            </div>
          </div>
          <SheetFooter className="mt-auto border-t">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{match === 'new' ? 'Add match' : 'Save changes'}</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
