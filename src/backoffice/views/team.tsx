'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Check, Copy, Crown, KeyRound, Loader2, MoreHorizontal, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { DataTable, type Col } from '@/backoffice/components/data-table'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { Checkbox } from '@/backoffice/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/backoffice/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/backoffice/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/backoffice/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { ROLE_OPTIONS, newMemberSchema, type NewMemberForm } from '@/backoffice/lib/forms'
import { createTeamMember, deleteTeamMember, setTeamRoles } from '@/backoffice/actions/team'

type Role = 'owner' | 'editor' | 'translator' | 'moderator'
export type TeamRow = { id: string; name: string; email: string; roles: Role[]; createdAt: string; chatSeen: string | null; main: boolean; me: boolean }

const ini = (n: string) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
const roleLabel = (r: string) => ROLE_OPTIONS.find((o) => o.value === r)?.label || r

export function TeamView({ rows, canManage }: { rows: TeamRow[]; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<TeamRow | null>(null)

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const r = await fn()
      if (r.ok) { toast.success(done); router.refresh() } else toast.error(r.error)
    })
  }
  function toggleRole(u: TeamRow, role: Role, on: boolean) {
    const next = on ? [...new Set([...u.roles, role])] : u.roles.filter((r) => r !== role)
    if (!next.length) { toast.error('Keep at least one role.'); return }
    act(() => setTeamRoles(u.id, next), `${u.name || u.email}: ${next.map(roleLabel).join(', ')}`)
  }

  const cols: Col<TeamRow>[] = useMemo(() => [
    {
      id: 'who', header: 'Person', accessorFn: (u) => u.name + ' ' + u.email,
      cell: ({ row: { original: u } }) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8"><AvatarFallback className="text-xs">{ini(u.name || u.email)}</AvatarFallback></Avatar>
          <div className="min-w-0 leading-tight">
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              {u.name || <span className="text-muted-foreground">No name</span>}
              {u.main && <Badge variant="secondary" className="gap-1 text-[10px]"><Crown className="size-3" />Main admin</Badge>}
              {u.me && <Badge variant="outline" className="text-[10px]">You</Badge>}
            </div>
            <div className="truncate text-xs text-muted-foreground">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'roles', header: 'Roles', accessorFn: (u) => u.roles.join(' '), size: 280,
      cell: ({ row: { original: u } }) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.length ? u.roles.map((r) => <Badge key={r} variant={r === 'owner' ? 'default' : 'secondary'}>{roleLabel(r)}</Badge>) : <span className="text-sm text-muted-foreground">No role</span>}
        </div>
      ),
    },
    { id: 'chat', header: 'Last in the chat', accessorFn: (u) => u.chatSeen || '', size: 150, cell: ({ row: { original: u } }) => <span className="text-sm text-muted-foreground">{u.chatSeen ? formatDistanceToNowStrict(new Date(u.chatSeen), { addSuffix: true }) : '—'}</span> },
    { id: 'joined', header: 'Added', accessorFn: (u) => u.createdAt, size: 120, cell: ({ row: { original: u } }) => <span className="text-sm text-muted-foreground">{format(new Date(u.createdAt), 'd MMM yyyy')}</span> },
    ...(canManage ? [{
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, size: 60,
      cell: ({ row: { original: u } }: { row: { original: TeamRow } }) => (
        <div className="flex justify-end">
          {u.me ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name || u.email}`} disabled={pending}><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Roles</DropdownMenuLabel>
                {ROLE_OPTIONS.map((o) => (
                  <DropdownMenuCheckboxItem key={o.value} checked={u.roles.includes(o.value)} disabled={u.main && o.value === 'owner'} onCheckedChange={(v) => toggleRole(u, o.value, !!v)} onSelect={(e) => e.preventDefault()}>
                    <div className="leading-tight"><div>{o.label}</div><div className="text-xs text-muted-foreground">{o.hint}</div></div>
                  </DropdownMenuCheckboxItem>
                ))}
                {!u.main && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(u)}><Trash2 />Delete account</DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ),
    } as Col<TeamRow>] : []),
  ], [pending, canManage]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader title="Team accounts" description={canManage ? 'People who can sign in to this back office. Only owners can add people or change roles.' : 'People who can sign in to this back office. Ask an owner to add people or change roles.'}>
        {canManage && <Button onClick={() => setAdding(true)}><UserPlus />Add person</Button>}
      </PageHeader>
      <div className="mb-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
        {ROLE_OPTIONS.map((o) => <div key={o.value} className="rounded-md border px-3 py-2"><b className="text-foreground">{o.label}</b> · {o.hint}</div>)}
      </div>
      <DataTable columns={cols} data={rows} searchPlaceholder="Search people" empty={<EmptyState icon={Users} title="No accounts">Add the first team member.</EmptyState>} />
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />The main admin can’t be deleted or lose the owner role. Forgotten passwords: “Forgot your password?” on the sign-in page, approved under Password resets.</p>

      {adding && <AddPerson onClose={() => setAdding(false)} onDone={() => router.refresh()} />}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.name || confirm?.email}?</AlertDialogTitle>
            <AlertDialogDescription>They can no longer sign in to the back office. Their past chat messages stay. This can’t be undone (you can add them again later).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) act(() => deleteTeamMember(confirm.id), 'Account deleted'); setConfirm(null) }}>Delete account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function AddPerson({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const { register, control, handleSubmit, formState } = useForm<NewMemberForm>({ resolver: zodResolver(newMemberSchema), defaultValues: { name: '', email: '', roles: ['editor'] } })
  const e = formState.errors

  function onSubmit(d: NewMemberForm) {
    start(async () => {
      const r = await createTeamMember(d)
      if (!r.ok || !r.data) { toast.error(r.ok ? 'Something went wrong' : r.error); return }
      setCreated({ email: d.email, password: r.data.password }); onDone()
    })
  }
  async function copy() {
    if (!created) return
    try { await navigator.clipboard.writeText(created.password); setCopied(true) } catch { toast.error('Copy is blocked here. Select the password and copy it by hand.') }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><KeyRound className="size-5" />Account created</DialogTitle>
              <DialogDescription>Give {created.email} this temporary password privately (not in a group chat). It’s shown only once. They can change it under My account after signing in.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
              <code className="flex-1 select-all font-mono text-base">{created.password}</code>
              <Button type="button" variant="outline" size="sm" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}</Button>
            </div>
            <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add a person</DialogTitle>
              <DialogDescription>They get a temporary password to sign in with.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="t-name">Name</Label>
              <Input id="t-name" aria-invalid={!!e.name} {...register('name')} />
              {e.name && <p className="text-xs text-destructive">{e.name.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-email">Email</Label>
              <Input id="t-email" type="email" autoComplete="off" aria-invalid={!!e.email} {...register('email')} />
              {e.email && <p className="text-xs text-destructive">{e.email.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Roles</Label>
              <Controller control={control} name="roles" render={({ field }) => (
                <div className="grid gap-2">
                  {ROLE_OPTIONS.map((o) => (
                    <label key={o.value} className="flex items-start gap-2.5 rounded-md border p-2.5 text-sm">
                      <Checkbox className="mt-0.5" checked={field.value.includes(o.value)} onCheckedChange={(v) => field.onChange(v ? [...new Set([...field.value, o.value])] : field.value.filter((x) => x !== o.value))} />
                      <span className="leading-tight"><b>{o.label}</b><span className="block text-xs text-muted-foreground">{o.hint}</span></span>
                    </label>
                  ))}
                </div>
              )} />
              {e.roles && <p className="text-xs text-destructive">{e.roles.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Create account</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
