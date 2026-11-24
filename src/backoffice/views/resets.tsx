'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Check, KeyRound, MailQuestion, X } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { DataTable, type Col } from '@/backoffice/components/data-table'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/backoffice/components/ui/tabs'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Avatar, AvatarFallback } from '@/backoffice/components/ui/avatar'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { decideReset } from '@/backoffice/actions/resets'

export type ResetRow = {
  id: string; kind: 'member' | 'staff'; staff: { id: string; name: string; roles: string[]; self: boolean; main?: boolean } | null; email: string; note: string; status: string; createdAt: string; decidedAt: string | null; decidedBy: string | null
  member: { id: string; name: string; status: string; joined: string; lastSeen: string | null; messages: number } | null
}

const ago = (d: string | null) => (d ? formatDistanceToNowStrict(new Date(d), { addSuffix: true }) : 'never')
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
const STATUS: Record<string, { label: string; className?: string; variant?: 'outline' | 'secondary' | 'destructive' }> = {
  pending: { label: 'Waiting', variant: 'secondary', className: 'bg-warning/20 text-foreground' },
  approved: { label: 'Approved · fan can reset', variant: 'outline', className: 'text-success' },
  done: { label: 'Password changed', variant: 'outline' },
  denied: { label: 'Declined', variant: 'secondary' },
  expired: { label: 'Expired', variant: 'secondary' },
}

export function ResetsView({ rows, canApproveStaff = false }: { rows: ResetRow[]; canApproveStaff?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState<ResetRow | null>(null)
  const waiting = rows.filter((r) => r.status === 'pending')
  const history = rows.filter((r) => r.status !== 'pending')

  function decide(r: ResetRow, d: 'approve' | 'deny') {
    start(async () => {
      const res = await decideReset(r.id, d)
      if (!res.ok) toast.error(res.error)
      else toast.success(d === 'approve' ? `Approved. ${r.member?.name || r.email} can now choose a new password on their device.` : 'Request declined')
      setConfirm(null)
      router.refresh()
    })
  }

  const cols: Col<ResetRow>[] = useMemo(() => {
    const base: Col<ResetRow>[] = [
      {
        id: 'who', header: 'Account', accessorFn: (r) => r.email + ' ' + (r.member?.name || ''),
        cell: ({ row: { original: r } }) => (
          <div className="flex items-start gap-2.5">
            <Avatar className="size-7"><AvatarFallback className="text-[11px]">{r.member ? ini(r.member.name) : r.staff ? ini(r.staff.name) : '?'}</AvatarFallback></Avatar>
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                {r.kind === 'staff'
                  ? (r.staff ? <>{r.staff.name}<Badge variant="secondary" className="text-[10px]">{r.staff.main ? 'Main admin' : 'Team account'} · {r.staff.roles.join(', ') || 'no role'}</Badge></> : <span className="text-muted-foreground">No team account with this email</span>)
                  : (r.member ? r.member.name : <span className="text-muted-foreground">No account with this email</span>)}
              </div>
              <div className="truncate text-xs text-muted-foreground">{r.email}</div>
              {r.member && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Joined {format(new Date(r.member.joined), 'd MMM yyyy')} · last seen {ago(r.member.lastSeen)} · {r.member.messages} messages
                  {r.member.status !== 'active' && <> · <span className="text-destructive">{r.member.status}</span></>}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'note', header: 'Their message', accessorFn: (r) => r.note,
        cell: ({ row: { original: r } }) => (r.note ? <p className="max-w-md text-sm whitespace-pre-wrap">{r.note}</p> : <span className="text-sm text-muted-foreground">—</span>),
      },
      { id: 'when', header: 'Asked', accessorFn: (r) => r.createdAt, size: 130, cell: ({ row: { original: r } }) => <span className="text-sm text-muted-foreground" title={format(new Date(r.createdAt), 'PPpp')}>{ago(r.createdAt)}</span> },
    ]
    return base
  }, [])

  const waitingCols: Col<ResetRow>[] = useMemo(() => [
    ...cols,
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, size: 210,
      cell: ({ row: { original: r } }) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => decide(r, 'deny')}><X />Decline</Button>
          {(() => {
            const has = r.kind === 'staff' ? !!r.staff : !!r.member
            const why = !has ? 'No account uses this email' : r.kind === 'staff' && !canApproveStaff ? 'Only an owner can approve team accounts' : r.staff?.main ? 'Main admin: reset only on the server (pnpm admin:reset-password)' : r.staff?.self ? 'Another owner has to approve your own reset' : undefined
            return <Button size="sm" disabled={pending || !!why} title={why} onClick={() => setConfirm(r)}><Check />Approve</Button>
          })()}
        </div>
      ),
    },
  ], [cols, pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const historyCols: Col<ResetRow>[] = useMemo(() => [
    ...cols,
    {
      id: 'status', header: 'Outcome', accessorFn: (r) => r.status, size: 230,
      cell: ({ row: { original: r } }) => {
        const s = STATUS[r.status] || STATUS.expired
        return (
          <div className="leading-tight">
            <Badge variant={s.variant} className={s.className}>{s.label}</Badge>
            {r.decidedBy && <div className="mt-1 text-xs text-muted-foreground">by {r.decidedBy} {ago(r.decidedAt)}</div>}
          </div>
        )
      },
    },
  ], [cols])

  return (
    <>
      <PageHeader title="Password resets" description="Fans who forgot their chat password ask here. Check that the request looks genuine, then approve it: the fan can then choose a new password on the device they asked from (for 48 hours). You never see or send a password." />
      <Tabs defaultValue="waiting">
        <TabsList>
          <TabsTrigger value="waiting">Waiting{waiting.length ? <Badge variant="secondary" className="ml-1.5">{waiting.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="waiting" className="mt-4">
          <DataTable columns={waitingCols} data={waiting} searchPlaceholder="Search requests" empty={<EmptyState icon={KeyRound} title="No requests waiting">When a fan uses “Forgot password?” in the chat, the request appears here.</EmptyState>} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <DataTable columns={historyCols} data={history} searchPlaceholder="Search history" empty={<EmptyState icon={MailQuestion} title="Nothing yet">Handled requests appear here.</EmptyState>} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve the reset for {confirm?.member?.name || confirm?.staff?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only approve if you’re confident this is the account owner ({confirm?.email}). They’ll be able to choose a new password on the device they asked from, and will be signed in.
              {confirm?.kind === 'staff' && ' This is a back-office account: check with the person directly (phone, in person) before approving.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={(e) => { e.preventDefault(); if (confirm) decide(confirm, 'approve') }}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
