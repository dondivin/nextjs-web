'use client'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, MessagesSquare, Plus, Sparkles } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { DataTable, type Col } from '@/backoffice/components/data-table'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/backoffice/components/ui/sheet'
import { groupSchema, type GroupForm } from '@/backoffice/lib/forms'
import { saveGroup } from '@/backoffice/actions/groups'
import { GroupAvatar, GroupFields, JOIN, KIND } from './group-fields'

export type GroupRow = {
  id: string; name: string; description: string; kind: 'group' | 'channel'; join: 'open' | 'request' | 'invite'; autoAdd: boolean; active: boolean
  gradient: string | null; order: number; members: number; requests: number; invited: number; owner: string | null
}

export function GroupsView({ rows }: { rows: GroupRow[] }) {
  const [creating, setCreating] = useState(false)
  const cols: Col<GroupRow>[] = useMemo(() => [
    {
      id: 'name', header: 'Room', accessorFn: (g) => g.name + ' ' + g.description,
      cell: ({ row: { original: g } }) => (
        <Link href={`/admin/groups/${g.id}`} className="flex items-center gap-2.5">
          <GroupAvatar gradient={g.gradient} kind={g.kind} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-medium">{g.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{g.description || KIND[g.kind].hint}</span>
          </span>
        </Link>
      ),
    },
    { id: 'owner', header: 'Made by', accessorFn: (g) => g.owner || 'Team', size: 140, cell: ({ row: { original: g } }) => (g.owner ? <span className="text-sm">{g.owner}</span> : <Badge variant="secondary">Team</Badge>) },
    { id: 'kind', header: 'Kind', accessorFn: (g) => g.kind, size: 110, cell: ({ row: { original: g } }) => <Badge variant="outline">{KIND[g.kind].label}</Badge> },
    {
      id: 'join', header: 'Who can join', accessorFn: (g) => g.join, size: 190,
      cell: ({ row: { original: g } }) => (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {JOIN[g.join].label}
          {g.autoAdd && <Badge variant="secondary" className="gap-1 text-[10px]"><Sparkles className="size-3" />Auto-add</Badge>}
        </div>
      ),
    },
    {
      id: 'members', header: 'Members', accessorFn: (g) => g.members, size: 170,
      cell: ({ row: { original: g } }) => (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {g.members}
          {g.requests > 0 && <Badge className="bg-warning/20 text-foreground">{g.requests} waiting</Badge>}
          {g.invited > 0 && <Badge variant="outline">{g.invited} invited</Badge>}
        </div>
      ),
    },
    { id: 'active', header: 'In the chat', accessorFn: (g) => (g.active ? 1 : 0), size: 110, cell: ({ row: { original: g } }) => (g.active ? <Badge variant="outline" className="text-success">Shown</Badge> : <Badge variant="secondary">Archived</Badge>) },
    { id: 'open', header: () => <span className="sr-only">Open</span>, enableSorting: false, size: 90, cell: ({ row: { original: g } }) => <div className="flex justify-end"><Button variant="ghost" size="sm" asChild><Link href={`/admin/groups/${g.id}`}>Manage</Link></Button></div> },
  ], [])

  return (
    <>
      <PageHeader title="Groups & channels" description="Extra rooms in the site chat, next to the lounge and the match rooms. Groups: everyone talks. Channels: only the team posts. Each room has its own joining rule.">
        <Button onClick={() => setCreating(true)}><Plus />New group or channel</Button>
      </PageHeader>
      <DataTable columns={cols} data={rows} searchPlaceholder="Search rooms" empty={<EmptyState icon={MessagesSquare} title="No groups or channels yet">Create the first one: an announcements channel, a group per league, a VIP group…</EmptyState>} />
      {creating && <NewGroup onClose={() => setCreating(false)} />}
    </>
  )
}

function NewGroup({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const { control, register, handleSubmit, formState } = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: '', description: '', rules: '', kind: 'group', join: 'open', autoAdd: false, active: true, order: 0 },
  })
  function onSubmit(d: GroupForm) {
    start(async () => {
      const r = await saveGroup(null, d)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`${d.name} created`)
      router.push(`/admin/groups/${r.data}`)
    })
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <form onSubmit={handleSubmit(onSubmit, () => toast.error('Some fields need fixing'))} className="flex min-h-full flex-col" noValidate>
          <SheetHeader>
            <SheetTitle>New group or channel</SheetTitle>
            <SheetDescription>You can change everything later and manage members on the room’s page.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4"><GroupFields control={control} register={register} errors={formState.errors} /></div>
          <SheetFooter className="mt-auto border-t">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Create</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
