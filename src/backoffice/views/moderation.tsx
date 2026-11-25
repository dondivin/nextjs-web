'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatDistanceToNowStrict, format } from 'date-fns'
import {
  ShieldAlert, ShieldCheck, MessageSquareX, Undo2, Ban, VolumeX, Volume2, MoreHorizontal, Flag, Users, MessagesSquare, CheckCheck, Crown, ImageOff,
} from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { DataTable, type Col } from '@/backoffice/components/data-table'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/backoffice/components/ui/tabs'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Avatar, AvatarFallback } from '@/backoffice/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/backoffice/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/backoffice/components/ui/select'
import { resolveReport, setMemberRole, setMemberStatus, setMessageDeleted } from '@/backoffice/actions/moderation'
import { removeMemberPhoto } from '@/backoffice/actions/profile'

export type ModReport = {
  id: string; messageId: string; text: string; room: string; authorId: string | null; authorName: string; authorStatus: string
  reporterName: string; reasons: string[]; count: number; createdAt: string
}
export type ModMessage = { id: string; text: string; imageUrl?: string | null; room: string; authorId: string | null; authorName: string; deleted: boolean; deletedBy: string | null; isMod: boolean; createdAt: string }
export type ModMember = { id: string; name: string; email: string; hasPhoto?: boolean; roleId: string | null; status: 'active' | 'muted' | 'banned'; mutedUntil: string | null; lastSeenAt: string | null; createdAt: string }

const REASON: Record<string, string> = { spam: 'Spam', abuse: 'Abuse', scam: 'Scam / paid tips', promo: 'Other promo code', other: 'Other' }
const MUTES = [['1h', '1 hour'], ['24h', '24 hours'], ['7d', '7 days'], ['forever', 'Until unmuted']] as const
const ago = (d: string | null) => (d ? formatDistanceToNowStrict(new Date(d), { addSuffix: true }) : '—')
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'

function Who({ name, sub }: { name: string; sub?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className="size-7"><AvatarFallback className="text-[11px]">{ini(name)}</AvatarFallback></Avatar>
      <div className="min-w-0 leading-tight"><div className="truncate text-sm font-medium">{name}</div>{sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}</div>
    </div>
  )
}
function StatusBadge({ status, mutedUntil }: { status: string; mutedUntil?: string | null }) {
  if (status === 'banned') return <Badge variant="destructive">Banned</Badge>
  if (status === 'muted') return <Badge variant="secondary" className="bg-warning/20 text-foreground">Muted{mutedUntil ? ` · until ${format(new Date(mutedUntil), 'd MMM HH:mm')}` : ''}</Badge>
  return <Badge variant="outline" className="text-success">Active</Badge>
}

export type ModRole = { id: string; name: string; isDefault: boolean; color: string | null }
export function ModerationView({ reports, messages, members, roles = [] }: { reports: ModReport[]; messages: ModMessage[]; members: ModMember[]; roles?: ModRole[] }) {
  const defaultRole = roles.find((r) => r.isDefault)
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: string; run: () => Promise<{ ok: boolean; error?: string }>; done: string }>(null)
  const [room, setRoom] = useState('all')

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const r = await fn()
      if (r.ok) { toast.success(done); router.refresh() } else toast.error(r.error || 'Something went wrong')
    })
  }

  const reportCols: Col<ModReport>[] = useMemo(() => [
    {
      id: 'message', header: 'Reported message', accessorFn: (r) => r.text + ' ' + r.authorName,
      cell: ({ row: { original: r } }) => (
        <div className="flex max-w-xl flex-col gap-1.5">
          <Who name={r.authorName} sub={<>{r.room} · {ago(r.createdAt)}</>} />
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">{r.text || <span className="italic text-muted-foreground">Message no longer available</span>}</p>
        </div>
      ),
    },
    {
      id: 'reports', header: 'Reports', accessorFn: (r) => r.count, size: 170,
      cell: ({ row: { original: r } }) => (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 text-sm font-medium"><Flag className="size-3.5 text-destructive" />{r.count} {r.count === 1 ? 'report' : 'reports'}</span>
          <div className="flex flex-wrap gap-1">{r.reasons.map((x) => <Badge key={x} variant="outline">{REASON[x] || x}</Badge>)}</div>
          <span className="text-xs text-muted-foreground">by {r.reporterName}{r.count > 1 ? ' and others' : ''}</span>
        </div>
      ),
    },
    { id: 'status', header: 'Author', accessorFn: (r) => r.authorStatus, size: 120, cell: ({ row: { original: r } }) => <StatusBadge status={r.authorStatus} /> },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, size: 260,
      cell: ({ row: { original: r } }) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => act(() => resolveReport(r.id, { dismiss: true }), 'Report dismissed')}>
            <CheckCheck />Keep
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="destructive" size="sm" disabled={pending}><MessageSquareX />Take action</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Remove the message and…</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => act(() => resolveReport(r.id, { deleteMessage: true }), 'Message removed')}><MessageSquareX />Only remove it</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={!r.authorId}><VolumeX />Mute the author</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {MUTES.map(([k, l]) => <DropdownMenuItem key={k} onSelect={() => act(() => resolveReport(r.id, { deleteMessage: true, mute: k }), `Removed and muted ${r.authorName}`)}>{l}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={!r.authorId} onSelect={() => setConfirm({ title: `Ban ${r.authorName}?`, body: 'The message is removed and this member can no longer post. You can lift the ban later in Members.', action: 'Ban member', done: `${r.authorName} is banned`, run: () => resolveReport(r.id, { deleteMessage: true, ban: true }) })}><Ban />Ban the author</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const rooms = useMemo(() => [...new Set(messages.map((m) => m.room))].sort(), [messages])
  const shownMessages = useMemo(() => (room === 'all' ? messages : messages.filter((m) => m.room === room)), [messages, room])
  const messageCols: Col<ModMessage>[] = useMemo(() => [
    {
      id: 'text', header: 'Message', accessorFn: (m) => m.text + ' ' + m.authorName,
      cell: ({ row: { original: m } }) => (
        <div className="flex max-w-xl flex-col gap-1">
          <Who name={m.authorName} sub={<>{m.room}{m.isMod && <> · <span className="text-brand">Mod</span></>}</>} />
          {m.imageUrl && <a href={m.imageUrl} target="_blank" rel="noopener" className="mt-1 block w-fit"><img src={m.imageUrl} alt="Picture sent in the chat" className={'max-h-32 rounded-md border ' + (m.deleted ? 'opacity-40' : '')} /></a>}
          <p className={'text-sm whitespace-pre-wrap ' + (m.deleted ? 'text-muted-foreground line-through' : '')}>{m.text}</p>
        </div>
      ),
    },
    { id: 'when', header: 'Sent', accessorFn: (m) => m.createdAt, size: 140, cell: ({ row: { original: m } }) => <span className="text-sm text-muted-foreground" title={format(new Date(m.createdAt), 'PPpp')}>{ago(m.createdAt)}</span> },
    { id: 'state', header: 'Status', accessorFn: (m) => (m.deleted ? 'removed' : 'visible'), size: 140, cell: ({ row: { original: m } }) => (m.deleted ? <Badge variant="secondary" title={m.deletedBy ? 'by ' + m.deletedBy : undefined}>Removed</Badge> : <Badge variant="outline">Visible</Badge>) },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, size: 120,
      cell: ({ row: { original: m } }) => (
        <div className="flex justify-end">
          {m.deleted
            ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => setMessageDeleted(m.id, false), 'Message restored')}><Undo2 />Restore</Button>
            : <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => act(() => setMessageDeleted(m.id, true), 'Message removed')}><MessageSquareX />Remove</Button>}
        </div>
      ),
    },
  ], [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const memberCols: Col<ModMember>[] = useMemo(() => [
    { id: 'name', header: 'Member', accessorFn: (m) => m.name + ' ' + m.email, cell: ({ row: { original: m } }) => <Who name={m.name} sub={m.email} /> },
    {
      id: 'role', header: 'Role', accessorFn: (m) => (roles.find((r) => r.id === m.roleId) || defaultRole)?.name || '', size: 190,
      cell: ({ row: { original: m } }) => (
        <Select value={m.roleId || 'default'} onValueChange={(v) => act(() => setMemberRole(m.id, v === 'default' ? null : v), `${m.name}: ${v === 'default' ? (defaultRole?.name || 'default role') : roles.find((r) => r.id === v)?.name}`)} disabled={pending}>
          <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{defaultRole ? `${defaultRole.name} (default)` : 'Default'}</SelectItem>
            {roles.filter((r) => !r.isDefault).map((r) => <SelectItem key={r.id} value={r.id}><span className="inline-block size-2 rounded-full" style={{ background: r.color || '#888' }} />{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      ),
    },
    { id: 'status', header: 'Status', accessorFn: (m) => m.status, size: 200, cell: ({ row: { original: m } }) => <StatusBadge status={m.status} mutedUntil={m.mutedUntil} /> },
    { id: 'seen', header: 'Last seen', accessorFn: (m) => m.lastSeenAt || '', size: 140, cell: ({ row: { original: m } }) => <span className="text-sm text-muted-foreground">{ago(m.lastSeenAt)}</span> },
    { id: 'joined', header: 'Joined', accessorFn: (m) => m.createdAt, size: 130, cell: ({ row: { original: m } }) => <span className="text-sm text-muted-foreground">{format(new Date(m.createdAt), 'd MMM yyyy')}</span> },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, size: 60,
      cell: ({ row: { original: m } }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name}`} disabled={pending}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {m.status !== 'active' && <DropdownMenuItem onSelect={() => act(() => setMemberStatus(m.id, 'active'), `${m.name} can post again`)}><Volume2 />{m.status === 'banned' ? 'Lift the ban' : 'Unmute'}</DropdownMenuItem>}
              {m.status !== 'banned' && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><VolumeX />Mute</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>{MUTES.map(([k, l]) => <DropdownMenuItem key={k} onSelect={() => act(() => setMemberStatus(m.id, 'muted', k), `${m.name} is muted`)}>{l}</DropdownMenuItem>)}</DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {m.hasPhoto && <DropdownMenuItem onSelect={() => act(() => removeMemberPhoto(m.id), `${m.name}’s photo was removed`)}><ImageOff />Remove profile photo</DropdownMenuItem>}
              {m.status !== 'banned' && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ title: `Ban ${m.name}?`, body: 'This member will no longer be able to post. You can lift the ban at any time.', action: 'Ban member', done: `${m.name} is banned`, run: () => setMemberStatus(m.id, 'banned') })}><Ban />Ban</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const muted = members.filter((m) => m.status !== 'active').length
  const staff = members.filter((m) => m.roleId && m.roleId !== defaultRole?.id).length

  return (
    <>
      <PageHeader title="Moderation" description="Review reported messages, remove content and manage chat members. Actions take effect in the live chat immediately." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ShieldAlert} label="Open reports" value={reports.length} tone={reports.length ? 'danger' : undefined} />
        <Stat icon={MessagesSquare} label="Recent messages" value={messages.length} />
        <Stat icon={VolumeX} label="Muted or banned" value={muted} />
        <Stat icon={Crown} label="Members with a special role" value={staff} />
      </div>
      <Tabs defaultValue={reports.length ? 'reports' : 'messages'}>
        <TabsList>
          <TabsTrigger value="reports"><Flag />Reports{reports.length > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5">{reports.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="messages"><MessagesSquare />Messages</TabsTrigger>
          <TabsTrigger value="members"><Users />Members</TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="mt-4">
          <DataTable columns={reportCols} data={reports} searchPlaceholder="Search reports" empty={<EmptyState icon={ShieldCheck} title="All clear">No open reports. New reports from the chat appear here.</EmptyState>} />
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <DataTable
            columns={messageCols} data={shownMessages} searchPlaceholder="Search messages or names"
            toolbar={
              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger className="w-56" aria-label="Room"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All rooms</SelectItem>{rooms.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            }
            empty={<EmptyState icon={MessagesSquare} title="No messages yet">Messages from the live chat appear here.</EmptyState>}
          />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <span>Delete accounts, reset passwords, edit usernames and see each member’s rooms and messages in <b>Members</b>.</span>
            <Button variant="outline" size="sm" asChild><a href="/admin/members">Open Members</a></Button>
          </div>
          <DataTable columns={memberCols} data={members} searchPlaceholder="Search by name or email" empty={<EmptyState icon={Users} title="No members yet">Visitors who sign up to chat appear here.</EmptyState>} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (confirm) act(confirm.run, confirm.done); setConfirm(null) }}>{confirm?.action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <span className={'flex size-9 items-center justify-center rounded-md ' + (tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}><Icon className="size-4" /></span>
      <div><div className="text-2xl font-semibold tabular-nums leading-none">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div>
    </div>
  )
}
