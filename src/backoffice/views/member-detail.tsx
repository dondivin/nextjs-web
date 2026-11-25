'use client'
import { PhotoZoom } from '@/backoffice/components/photo-zoom'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { ArrowLeft, Ban, Check, Hash, ImageOff, KeyRound, Loader2, Megaphone, MessageCircle, MessagesSquare, ShieldAlert, Trash2, Undo2, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/backoffice/components/ui/button'
import { Badge } from '@/backoffice/components/ui/badge'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { Textarea } from '@/backoffice/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/backoffice/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { setMemberRole, setMemberStatus, setMessageDeleted } from '@/backoffice/actions/moderation'
import { removeMemberPhoto } from '@/backoffice/actions/profile'
import { saveMemberDetails } from '@/backoffice/actions/members'
import { DeleteMemberDialog, TempPasswordDialog } from './member-dialogs'
import { MemberAvatar, MemberStatus, MUTES, RolePicker, type RoleOpt } from './members'

export type MemberDetailData = {
  id: string; name: string; email: string; note: string; avatarUrl: string | null; gradient: string | null; roleId: string | null
  status: 'active' | 'muted' | 'banned'; mutedUntil: string | null; online: boolean; lastSeenAt: string | null; createdAt: string; rulesAcceptedAt: string | null
  messages: number; reports: number; openResets: number; owned: number
  recent: { id: string; text: string; room: string; deleted: boolean; createdAt: string }[]
  rooms: { id: string; name: string; kind: 'group' | 'channel'; status: 'member' | 'requested' | 'invited'; admin: boolean; owner: boolean; active: boolean }[]
  chats: { id: string; with: string; withId: string; status: string; outgoing: boolean }[]
}
type Role = RoleOpt & { createGroups: boolean; createChannels: boolean; sendPictures: boolean; privateChats: boolean }

const CHAT_STATUS: Record<string, string> = { pending: 'Request waiting', accepted: 'Chatting', declined: 'Declined', blocked: 'Blocked' }

export function MemberDetail({ m, roles }: { m: MemberDetailData; roles: Role[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [form, setForm] = useState({ name: m.name, email: m.email, note: m.note })
  const [pw, setPw] = useState(false)
  const [del, setDel] = useState(false)
  const [ban, setBan] = useState(false)
  const dirty = form.name !== m.name || form.email !== m.email || form.note !== m.note
  const role = roles.find((r) => r.id === m.roleId) || roles.find((r) => r.isDefault)
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { toast.success(ok); router.refresh() } else toast.error(r.error) })
  const ref = { id: m.id, name: m.name, email: m.email, messages: m.messages }
  const rights = role ? [role.createGroups && 'create groups', role.createChannels && 'create channels', role.sendPictures && 'send pictures', role.privateChats && 'start private chats'].filter(Boolean) as string[] : []

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/admin/members" aria-label="Back to members"><ArrowLeft /></Link></Button>
          <PhotoZoom url={m.avatarUrl} label="Profile photo"><MemberAvatar name={m.name} url={m.avatarUrl} gradient={m.gradient} online={m.online} size={48} /></PhotoZoom>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              <span className="truncate">{m.name}</span><MemberStatus status={m.status} mutedUntil={m.mutedUntil} />
              {role && !role.isDefault && <span className="rounded-md px-2 py-0.5 text-xs font-semibold text-white" style={{ background: role.color || '#3E63DD' }}>{role.name}</span>}
            </h1>
            <p className="text-sm text-muted-foreground">{m.email} · {m.online ? <span className="font-medium text-success">online now</span> : m.lastSeenAt ? `last seen ${formatDistanceToNowStrict(new Date(m.lastSeenAt), { addSuffix: true })}` : 'never seen'} · joined {format(new Date(m.createdAt), 'd MMM yyyy')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setPw(true)}><KeyRound />Reset password</Button>
          {m.status === 'banned'
            ? <Button variant="outline" disabled={pending} onClick={() => act(() => setMemberStatus(m.id, 'active'), `${m.name} can post again`)}><Undo2 />Lift the ban</Button>
            : <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setBan(true)}><Ban />Ban</Button>}
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDel(true)}><Trash2 />Delete</Button>
        </div>
      </div>

      {m.openResets > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <span>{m.name} asked to reset their password.</span>
          <Button variant="outline" size="sm" asChild><Link href="/admin/resets">Open password resets</Link></Button>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Account</CardTitle><CardDescription>Fix a username or e-mail address. The note is only seen by the team.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2"><Label htmlFor="md-name">Username</Label><Input id="md-name" value={form.name} maxLength={24} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid gap-2"><Label htmlFor="md-email">E-mail</Label><Input id="md-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid gap-2"><Label htmlFor="md-note">Team note (private)</Label><Textarea id="md-note" rows={3} value={form.note} placeholder="e.g. Warned on 12 Nov for spam" onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!dirty || pending} onClick={() => act(() => saveMemberDetails(m.id, form), 'Saved')}>{pending ? <Loader2 className="animate-spin" /> : <Check />}Save</Button>
                {dirty && <Button variant="ghost" onClick={() => setForm({ name: m.name, email: m.email, note: m.note })}>Discard</Button>}
                {m.avatarUrl && <Button variant="ghost" className="ml-auto" disabled={pending} onClick={() => act(() => removeMemberPhoto(m.id), 'Photo removed')}><ImageOff />Remove profile photo</Button>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Role</CardTitle><CardDescription>Promote or demote: the role decides what they may do in the chat (Member roles).</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <RolePicker value={m.roleId} roles={roles} disabled={pending} onChange={(v) => act(() => setMemberRole(m.id, v), `${m.name} is now ${(v ? roles.find((r) => r.id === v) : roles.find((r) => r.isDefault))?.name || 'on the default role'}`)} />
              <p className="text-sm text-muted-foreground">{rights.length ? `Can ${rights.join(', ')}.` : 'Can chat; no extra rights.'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Posting</CardTitle><CardDescription>Muted and banned members still read the chat; they can’t post, react or send requests.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {m.status !== 'active' && <Button variant="outline" disabled={pending} onClick={() => act(() => setMemberStatus(m.id, 'active'), `${m.name} can post again`)}><Volume2 />{m.status === 'banned' ? 'Lift the ban' : 'Unmute'}</Button>}
              {m.status !== 'banned' && MUTES.map(([k, l]) => <Button key={k} variant="outline" size="sm" disabled={pending} onClick={() => act(() => setMemberStatus(m.id, 'muted', k), `${m.name} is muted (${l.toLowerCase()})`)}><VolumeX />Mute {l.toLowerCase()}</Button>)}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-3 gap-3">
            <Mini icon={MessagesSquare} label="Messages" value={m.messages} />
            <Mini icon={ShieldAlert} label="Reports" value={m.reports} tone={m.reports ? 'warn' : undefined} />
            <Mini icon={Hash} label="Rooms made" value={m.owned} />
          </div>

          <Card>
            <CardHeader><CardTitle>Groups & channels</CardTitle></CardHeader>
            <CardContent>
              {m.rooms.length === 0 ? <p className="text-sm text-muted-foreground">Not in any group or channel.</p> : (
                <ul className="flex flex-col divide-y">
                  {m.rooms.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                      {r.kind === 'channel' ? <Megaphone className="size-4 text-muted-foreground" /> : <MessagesSquare className="size-4 text-muted-foreground" />}
                      <Link href={`/admin/groups/${r.id}`} className="min-w-0 flex-1 truncate hover:underline">{r.name}</Link>
                      {!r.active && <Badge variant="secondary">Archived</Badge>}
                      <Badge variant={r.status === 'member' ? 'outline' : 'secondary'}>{r.owner ? 'Owner' : r.admin ? 'Co-admin' : r.status === 'member' ? 'Member' : r.status === 'requested' ? 'Asked to join' : 'Invited'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Private chats</CardTitle><CardDescription>People they chat with one-to-one (messages stay private).</CardDescription></CardHeader>
            <CardContent>
              {m.chats.length === 0 ? <p className="text-sm text-muted-foreground">No private chats.</p> : (
                <ul className="flex flex-col divide-y">
                  {m.chats.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                      <MessageCircle className="size-4 text-muted-foreground" />
                      {c.withId ? <Link href={`/admin/members/${c.withId}`} className="min-w-0 flex-1 truncate hover:underline">{c.with}</Link> : <span className="flex-1">{c.with}</span>}
                      <span className="text-xs text-muted-foreground">{c.outgoing ? 'they asked' : 'asked them'}</span>
                      <Badge variant="outline">{CHAT_STATUS[c.status] || c.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent messages</CardTitle><CardDescription>Their last 30, newest first. Private chat messages are not shown.</CardDescription></CardHeader>
            <CardContent>
              {m.recent.filter((x) => x.room !== 'Private chat').length === 0 ? <p className="text-sm text-muted-foreground">No messages yet.</p> : (
                <ul className="flex flex-col divide-y">
                  {m.recent.filter((x) => x.room !== 'Private chat').map((x) => (
                    <li key={x.id} className="flex items-start gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className={'whitespace-pre-wrap break-words text-sm ' + (x.deleted ? 'text-muted-foreground line-through' : '')}>{x.text}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{x.room} · {formatDistanceToNowStrict(new Date(x.createdAt), { addSuffix: true })}</p>
                      </div>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => setMessageDeleted(x.id, !x.deleted), x.deleted ? 'Message restored' : 'Message removed')}>{x.deleted ? 'Restore' : 'Remove'}</Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">{m.rulesAcceptedAt ? `Accepted the house rules ${format(new Date(m.rulesAcceptedAt), 'd MMM yyyy')}.` : 'Has not accepted the house rules yet.'}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <TempPasswordDialog member={pw ? ref : null} onClose={() => setPw(false)} />
      <DeleteMemberDialog member={del ? ref : null} onClose={() => setDel(false)} onDeleted={() => router.push('/admin/members')} />
      <AlertDialog open={ban} onOpenChange={setBan}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban {m.name}?</AlertDialogTitle>
            <AlertDialogDescription>They can still sign in and read, but can no longer post, react or send requests, and they don’t show up in people search. You can lift the ban at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => act(() => setMemberStatus(m.id, 'banned'), `${m.name} is banned`)}>Ban member</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Mini({ icon: I, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <I className={'size-4 ' + (tone === 'warn' ? 'text-warning' : 'text-muted-foreground')} />
      <div className="mt-2 text-2xl font-semibold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
