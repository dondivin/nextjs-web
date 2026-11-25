'use client'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format, formatDistanceToNowStrict, subDays } from 'date-fns'
import { Ban, ImageOff, KeyRound, MoreHorizontal, Trash2, UserRound, UserPlus, Users, Volume2, VolumeX, Wifi } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { DataTable, type Col } from '@/backoffice/components/data-table'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/backoffice/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/backoffice/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/backoffice/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { setMemberRole, setMemberStatus } from '@/backoffice/actions/moderation'
import { removeMemberPhoto } from '@/backoffice/actions/profile'
import { DeleteMemberDialog, TempPasswordDialog, type MemberRef } from './member-dialogs'

export type MemberRow = {
  id: string; name: string; email: string; avatarUrl: string | null; gradient: string | null; roleId: string | null
  status: 'active' | 'muted' | 'banned'; mutedUntil: string | null; messages: number; online: boolean; lastSeenAt: string | null; createdAt: string
}
export type RoleOpt = { id: string; name: string; isDefault: boolean; color: string | null }
export const MUTES = [['1h', '1 hour'], ['24h', '24 hours'], ['7d', '7 days'], ['forever', 'Until unmuted']] as const

const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
export function MemberAvatar({ name, url, gradient, online, size = 32 }: { name: string; url: string | null; gradient: string | null; online?: boolean; size?: number }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" className="size-full rounded-full object-cover" />
        : <span className="grid size-full place-items-center rounded-full font-semibold text-white" style={{ background: gradient || '#64748b', fontSize: size * 0.36 }}>{ini(name)}</span>}
      {online && <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success ring-2 ring-background" aria-label="online" />}
    </span>
  )
}
export function MemberStatus({ status, mutedUntil }: { status: string; mutedUntil?: string | null }) {
  if (status === 'banned') return <Badge variant="destructive">Banned</Badge>
  if (status === 'muted') return <Badge variant="secondary" className="bg-warning/20 text-foreground">Muted{mutedUntil ? ` · until ${format(new Date(mutedUntil), 'd MMM HH:mm')}` : ''}</Badge>
  return <Badge variant="outline" className="text-success">Active</Badge>
}
export function RolePicker({ value, roles, disabled, onChange }: { value: string | null; roles: RoleOpt[]; disabled?: boolean; onChange: (roleId: string | null) => void }) {
  const def = roles.find((r) => r.isDefault)
  return (
    <Select value={value || 'default'} onValueChange={(v) => onChange(v === 'default' ? null : v)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="default">{def ? `${def.name} (default)` : 'Default'}</SelectItem>
        {roles.filter((r) => !r.isDefault).map((r) => <SelectItem key={r.id} value={r.id}><span className="inline-block size-2 rounded-full" style={{ background: r.color || '#888' }} />{r.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function MembersView({ rows, roles }: { rows: MemberRow[]; roles: RoleOpt[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<'all' | 'online' | 'active' | 'muted' | 'banned'>('all')
  const [roleFilter, setRoleFilter] = useState<string>('any')
  const [pwFor, setPwFor] = useState<MemberRef | null>(null)
  const [delFor, setDelFor] = useState<MemberRef | null>(null)
  const [banFor, setBanFor] = useState<MemberRow | null>(null)
  const def = roles.find((r) => r.isDefault)
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { toast.success(ok); router.refresh() } else toast.error(r.error) })
  const roleName = (id: string | null) => (id ? roles.find((r) => r.id === id)?.name : def?.name) || 'Default'

  const weekAgo = subDays(new Date(), 7).toISOString()
  const stats = {
    total: rows.length, online: rows.filter((m) => m.online).length, week: rows.filter((m) => m.createdAt >= weekAgo).length,
    restricted: rows.filter((m) => m.status !== 'active').length,
  }
  const shown = rows.filter((m) => (tab === 'all' || (tab === 'online' ? m.online : m.status === tab)) && (roleFilter === 'any' || (roleFilter === 'default' ? !m.roleId || m.roleId === def?.id : m.roleId === roleFilter)))

  const cols: Col<MemberRow>[] = useMemo(() => [
    {
      id: 'name', header: 'Member', accessorFn: (m) => m.name + ' ' + m.email,
      cell: ({ row: { original: m } }) => (
        <Link href={`/admin/members/${m.id}`} className="flex min-w-0 items-center gap-2.5">
          <MemberAvatar name={m.name} url={m.avatarUrl} gradient={m.gradient} online={m.online} />
          <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-medium">{m.name}</span><span className="block truncate text-xs text-muted-foreground">{m.email}</span></span>
        </Link>
      ),
    },
    { id: 'role', header: 'Role', accessorFn: (m) => roleName(m.roleId), size: 180, cell: ({ row: { original: m } }) => <RolePicker value={m.roleId} roles={roles} disabled={pending} onChange={(v) => act(() => setMemberRole(m.id, v), `${m.name} is now ${v ? roles.find((r) => r.id === v)?.name : def?.name || 'on the default role'}`)} /> },
    { id: 'status', header: 'Status', accessorFn: (m) => m.status, size: 170, cell: ({ row: { original: m } }) => <MemberStatus status={m.status} mutedUntil={m.mutedUntil} /> },
    { id: 'messages', header: 'Messages', accessorFn: (m) => m.messages, size: 100, cell: ({ row: { original: m } }) => <span className="text-sm tabular-nums">{m.messages}</span> },
    { id: 'seen', header: 'Last seen', accessorFn: (m) => (m.online ? '9' : m.lastSeenAt || ''), size: 130, cell: ({ row: { original: m } }) => <span className={'text-sm ' + (m.online ? 'font-medium text-success' : 'text-muted-foreground')}>{m.online ? 'Online now' : m.lastSeenAt ? formatDistanceToNowStrict(new Date(m.lastSeenAt), { addSuffix: true }) : '—'}</span> },
    { id: 'joined', header: 'Joined', accessorFn: (m) => m.createdAt, size: 120, cell: ({ row: { original: m } }) => <span className="text-sm text-muted-foreground">{format(new Date(m.createdAt), 'd MMM yyyy')}</span> },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, size: 56,
      cell: ({ row: { original: m } }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name}`} disabled={pending}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild><Link href={`/admin/members/${m.id}`}><UserRound />Open profile</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              {m.status !== 'active' && <DropdownMenuItem onSelect={() => act(() => setMemberStatus(m.id, 'active'), `${m.name} can post again`)}><Volume2 />{m.status === 'banned' ? 'Lift the ban' : 'Unmute'}</DropdownMenuItem>}
              {m.status !== 'banned' && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><VolumeX />Mute</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>{MUTES.map(([k, l]) => <DropdownMenuItem key={k} onSelect={() => act(() => setMemberStatus(m.id, 'muted', k), `${m.name} is muted`)}>{l}</DropdownMenuItem>)}</DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {m.status !== 'banned' && <DropdownMenuItem onSelect={() => setBanFor(m)}><Ban />Ban</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setPwFor(m)}><KeyRound />Reset password</DropdownMenuItem>
              {m.avatarUrl && <DropdownMenuItem onSelect={() => act(() => removeMemberPhoto(m.id), `${m.name}’s photo was removed`)}><ImageOff />Remove profile photo</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDelFor(m)}><Trash2 />Delete account</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [pending, roles]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader title="Members" description="Every account registered in the site chat. Change roles (promote / demote), mute, ban, reset passwords or delete accounts. Open a member for their details, rooms and messages." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Accounts" value={stats.total} />
        <Stat icon={Wifi} label="Online now" value={stats.online} />
        <Stat icon={UserPlus} label="New this week" value={stats.week} />
        <Stat icon={VolumeX} label="Muted or banned" value={stats.restricted} />
      </div>
      <DataTable
        columns={cols} data={shown} searchPlaceholder="Search by username or e-mail" pageSize={25}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="online">Online</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="muted">Muted</TabsTrigger>
                <TabsTrigger value="banned">Banned</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Every role</SelectItem>
                <SelectItem value="default">{def ? def.name : 'Default role'}</SelectItem>
                {roles.filter((r) => !r.isDefault).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
        empty={<EmptyState icon={Users} title={rows.length ? 'Nobody matches' : 'No members yet'}>{rows.length ? 'Try another filter.' : 'People appear here when they create an account in the site chat.'}</EmptyState>}
      />

      <TempPasswordDialog member={pwFor} onClose={() => setPwFor(null)} />
      <DeleteMemberDialog member={delFor} onClose={() => setDelFor(null)} onDeleted={() => router.refresh()} />
      <AlertDialog open={!!banFor} onOpenChange={(o) => !o && setBanFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban {banFor?.name}?</AlertDialogTitle>
            <AlertDialogDescription>They can still sign in and read, but can no longer post, react or send requests. You can lift the ban at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (banFor) act(() => setMemberStatus(banFor.id, 'banned'), `${banFor.name} is banned`); setBanFor(null) }}>Ban member</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Stat({ icon: I, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground"><I className="size-4" /></span>
      <div><div className="text-2xl font-semibold tabular-nums leading-none">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div>
    </div>
  )
}
