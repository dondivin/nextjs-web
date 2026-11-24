'use client'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowLeft, Check, Loader2, Search, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { Button } from '@/backoffice/components/ui/button'
import { Badge } from '@/backoffice/components/ui/badge'
import { Input } from '@/backoffice/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/backoffice/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/backoffice/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { groupSchema, type GroupForm } from '@/backoffice/lib/forms'
import { addAllMembers, deleteGroup, findMembers, saveGroup, setGroupMember } from '@/backoffice/actions/groups'
import { GroupAvatar, GroupFields } from './group-fields'

export type GroupMemberRow = { id: string; name: string; gradient: string | null; status: 'member' | 'requested' | 'invited'; since: string; lastSeen: string | null; admin?: boolean; owner?: boolean }

const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
function Person({ name, gradient, sub }: { name: string; gradient: string | null; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: gradient || '#64748b' }}>{ini(name)}</span>
      <div className="min-w-0 leading-tight"><div className="truncate text-sm font-medium">{name}</div>{sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}</div>
    </div>
  )
}

export function GroupEditor({ id, initial, members, gradient, updatedAt, owner = null }: { id: string; initial: GroupForm; members: GroupMemberRow[]; gradient: string | null; updatedAt: string; owner?: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { control, register, handleSubmit, formState, reset } = useForm<GroupForm>({ resolver: zodResolver(groupSchema), defaultValues: initial })
  const v = useWatch({ control }) as GroupForm

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => { const r = await fn(); if (r.ok) { toast.success(done); router.refresh() } else toast.error(r.error) })
  }
  function onSubmit(d: GroupForm) {
    start(async () => { const r = await saveGroup(id, d); if (r.ok) { toast.success('Saved. Open chats update right away.'); reset(d); router.refresh() } else toast.error(r.error) })
  }

  const list = { member: members.filter((m) => m.status === 'member'), requested: members.filter((m) => m.status === 'requested'), invited: members.filter((m) => m.status === 'invited') }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error('Some fields need fixing'))} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/admin/groups" aria-label="Back to groups"><ArrowLeft /></Link></Button>
          <GroupAvatar gradient={gradient} kind={v.kind} size={40} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{v.name || 'Room'}</h1>
            <p className="text-sm text-muted-foreground">{owner ? `Made by ${owner} · ` : 'Team room · '}{formState.isDirty ? 'Unsaved changes' : `Saved ${formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true })}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 />Delete</Button>
          <Button type="submit" disabled={pending || !formState.isDirty}>{pending ? <Loader2 className="animate-spin" /> : <Check />}Save changes</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle>Settings</CardTitle><CardDescription>How the room works in the chat.</CardDescription></CardHeader>
          <CardContent><GroupFields control={control} register={register} errors={formState.errors} /></CardContent>
        </Card>

        <Card className="xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="size-4" />Members</CardTitle>
            <CardDescription>{list.member.length} member{list.member.length === 1 ? '' : 's'}. The team (moderators) can read and post in every room without joining.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <InviteBox roomId={id} existing={members.map((m) => m.id)} onDone={() => router.refresh()} join={v.join} />
            <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending}
              onClick={() => start(async () => { const r = await addAllMembers(id); if (r.ok) { toast.success(`All ${r.data} accounts are now members`); router.refresh() } else toast.error(r.error) })}>
              <Users />Add all members
            </Button>
            <Tabs defaultValue={list.requested.length ? 'requested' : 'member'}>
              <TabsList>
                <TabsTrigger value="member">Members</TabsTrigger>
                <TabsTrigger value="requested">Waiting{list.requested.length ? <Badge className="ml-1.5 bg-warning/20 text-foreground">{list.requested.length}</Badge> : null}</TabsTrigger>
                <TabsTrigger value="invited">Invited{list.invited.length ? <Badge variant="secondary" className="ml-1.5">{list.invited.length}</Badge> : null}</TabsTrigger>
              </TabsList>
              {(['member', 'requested', 'invited'] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-3">
                  {list[tab].length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{tab === 'member' ? 'No members yet.' : tab === 'requested' ? 'Nobody is waiting to join.' : 'No open invites.'}</p>
                  ) : (
                    <ul className="flex max-h-[420px] flex-col divide-y overflow-y-auto">
                      {list[tab].map((m) => (
                        <li key={m.id} className="flex items-center gap-2 py-2">
                          <div className="min-w-0 flex-1"><Person name={m.name} gradient={m.gradient} sub={(m.owner ? 'Owner · ' : m.admin ? 'Co-admin · ' : '') + (tab === 'member' ? 'Joined ' : tab === 'requested' ? 'Asked ' : 'Invited ') + formatDistanceToNowStrict(new Date(m.since), { addSuffix: true })} /></div>
                          {tab === 'member' && !m.owner && (
                            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => act(() => setGroupMember(id, m.id, m.admin ? 'unadmin' : 'admin'), m.admin ? `${m.name} is no longer an admin` : `${m.name} is now an admin`)}>{m.admin ? 'Remove admin' : 'Make admin'}</Button>
                          )}
                          {tab === 'requested' ? (
                            <>
                              <Button type="button" size="sm" disabled={pending} onClick={() => act(() => setGroupMember(id, m.id, 'accept'), `${m.name} is in`)}><Check />Accept</Button>
                              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => act(() => setGroupMember(id, m.id, 'decline'), 'Request declined')}><X />Decline</Button>
                            </>
                          ) : (
                            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending}
                              onClick={() => act(() => setGroupMember(id, m.id, 'remove'), tab === 'member' ? `${m.name} removed` : 'Invite cancelled')}>
                              <UserMinus />{tab === 'member' ? 'Remove' : 'Cancel'}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {initial.name}?</AlertDialogTitle>
            <AlertDialogDescription>The room, its members list and all its messages are deleted. To keep the history, switch “Shown in the chat” off instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => start(async () => { const r = await deleteGroup(id); if (r.ok) { toast.success('Room deleted'); router.push('/admin/groups') } else toast.error(r.error) })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

/** Find a member by username and invite (or add) them. */
function InviteBox({ roomId, existing, onDone, join }: { roomId: string; existing: string[]; onDone: () => void; join: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; gradient: string | null }[]>([])
  const [pending, start] = useTransition()
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    const t = setTimeout(() => { findMembers(term).then((r) => setResults(r.ok && r.data ? r.data : [])) }, 250)
    return () => clearTimeout(t)
  }, [q])
  function go(m: { id: string; name: string }, action: 'invite' | 'add') {
    start(async () => {
      const r = await setGroupMember(roomId, m.id, action)
      if (r.ok) { toast.success(action === 'invite' ? `${m.name} is invited. They accept in the chat.` : `${m.name} was added`); setQ(''); setResults([]); onDone() } else toast.error(r.error)
    })
  }
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invite someone by username" className="pl-8" aria-label="Invite someone by username" />
      </div>
      {results.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {results.map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1"><Person name={m.name} gradient={m.gradient} /></div>
              {existing.includes(m.id) ? <span className="text-xs text-muted-foreground">Already listed</span> : (
                <>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => go(m, 'invite')}><UserPlus />Invite</Button>
                  {join !== 'invite' && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => go(m, 'add')}>Add directly</Button>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Invited people see the room in their chat and accept or decline.</p>
    </div>
  )
}
