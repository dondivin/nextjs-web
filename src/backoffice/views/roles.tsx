'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { BadgeCheck, Hash, ImageIcon, Loader2, Megaphone, MessageCircle, MessagesSquare, MoreHorizontal, Pencil, Plus, Shield, Star, Trash2 } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { DataTable, type Col } from '@/backoffice/components/data-table'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { Switch } from '@/backoffice/components/ui/switch'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/backoffice/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/backoffice/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { roleSchema, type RoleForm } from '@/backoffice/lib/forms'
import { deleteRole, saveRole } from '@/backoffice/actions/roles'

export type RoleRow = RoleForm & { id: string; members: number }

const RIGHTS: { key: keyof RoleForm; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'createGroups', label: 'Create groups', hint: 'Make groups from the chat and manage them (members, co-admins, settings)', icon: MessagesSquare },
  { key: 'createChannels', label: 'Create channels', hint: 'Make channels where only they and their co-admins post', icon: Megaphone },
  { key: 'sendPictures', label: 'Send pictures', hint: 'Pictures in the lounge, match rooms and groups (everyone can send pictures to the partner team)', icon: ImageIcon },
  { key: 'privateChats', label: 'Private chats', hint: 'Send chat requests to other members', icon: MessageCircle },
  { key: 'showBadge', label: 'Show a badge', hint: 'The role name appears next to their name in the chat, in the role colour', icon: BadgeCheck },
]
const EMPTY: RoleForm = { name: '', description: '', color: '#3E63DD', isDefault: false, order: 0, createGroups: false, createChannels: false, maxRooms: 3, sendPictures: false, privateChats: true, showBadge: true }

function RoleChip({ name, color }: { name: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold text-white" style={{ background: color }}>{name}</span>
}

export function RolesView({ rows }: { rows: RoleRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<RoleRow | 'new' | null>(null)
  const [confirm, setConfirm] = useState<RoleRow | null>(null)

  const cols: Col<RoleRow>[] = useMemo(() => [
    {
      id: 'name', header: 'Role', accessorFn: (r) => r.name + ' ' + r.description,
      cell: ({ row: { original: r } }) => (
        <button type="button" className="text-left" onClick={() => setEditing(r)}>
          <div className="flex items-center gap-2"><RoleChip name={r.name} color={r.color} />{r.isDefault && <Badge variant="outline" className="gap-1 text-[10px]"><Star className="size-3" />Default</Badge>}</div>
          {r.description && <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>}
        </button>
      ),
    },
    {
      id: 'rights', header: 'Can', enableSorting: false,
      cell: ({ row: { original: r } }) => {
        const on = RIGHTS.filter((x) => r[x.key])
        return on.length ? <div className="flex flex-wrap gap-1">{on.map((x) => <Badge key={x.key} variant="secondary" className="gap-1 font-normal"><x.icon className="size-3" />{x.label}</Badge>)}{(r.createGroups || r.createChannels) && <Badge variant="outline" className="font-normal">max {r.maxRooms} rooms</Badge>}</div> : <span className="text-sm text-muted-foreground">Chat only</span>
      },
    },
    { id: 'members', header: 'Members', accessorFn: (r) => r.members, size: 100, cell: ({ row: { original: r } }) => <span className="text-sm">{r.members}</span> },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, size: 60,
      cell: ({ row: { original: r } }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`} disabled={pending}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(r)}><Pencil />Edit</DropdownMenuItem>
              {!r.isDefault && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setConfirm(r)}><Trash2 />Delete</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [pending])

  return (
    <>
      <PageHeader title="Member roles" description="What chat members may do. Every member has one role (new accounts get the default one); change a member’s role under Moderation → Members. The team can always do everything.">
        <Button onClick={() => setEditing('new')}><Plus />New role</Button>
      </PageHeader>
      <DataTable columns={cols} data={rows} searchPlaceholder="Search roles" empty={<EmptyState icon={Shield} title="No roles yet">Create the default role first.</EmptyState>} />

      {editing && <RoleSheet key={editing === 'new' ? 'new' : editing.id} role={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh() }} />}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the role {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its {confirm?.members} member{confirm?.members === 1 ? '' : 's'} go back to the default role. Rooms they made stay.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) start(async () => { const r = await deleteRole(confirm.id); if (r.ok) { toast.success('Role deleted'); router.refresh() } else toast.error(r.error) }); setConfirm(null) }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function RoleSheet({ role, onClose, onSaved }: { role: RoleRow | 'new'; onClose: () => void; onSaved: () => void }) {
  const [pending, start] = useTransition()
  const initial: RoleForm = role === 'new' ? EMPTY : { name: role.name, description: role.description, color: role.color, isDefault: role.isDefault, order: role.order, createGroups: role.createGroups, createChannels: role.createChannels, maxRooms: role.maxRooms, sendPictures: role.sendPictures, privateChats: role.privateChats, showBadge: role.showBadge }
  const { control, register, handleSubmit, formState } = useForm<RoleForm>({ resolver: zodResolver(roleSchema), defaultValues: initial })
  const v = useWatch({ control }) as RoleForm
  const e = formState.errors
  function onSubmit(d: RoleForm) {
    start(async () => {
      const r = await saveRole(role === 'new' ? null : role.id, d)
      if (r.ok) { toast.success(role === 'new' ? `${d.name} created` : 'Role saved. Members get the new rights right away.'); onSaved() } else toast.error(r.error)
    })
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit, () => toast.error('Some fields need fixing'))} className="flex min-h-full flex-col" noValidate>
          <SheetHeader>
            <SheetTitle>{role === 'new' ? 'New role' : `Edit ${initial.name}`}</SheetTitle>
            <SheetDescription>Rights apply in the site chat.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-4 pb-4">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="grid gap-2">
                <Label htmlFor="r-name">Name</Label>
                <Input id="r-name" placeholder="e.g. VIP, Tipster, Community leader" aria-invalid={!!e.name} {...register('name')} />
                {e.name && <p className="text-xs text-destructive">{e.name.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="r-color">Colour</Label>
                <Controller control={control} name="color" render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <input id="r-color" type="color" value={field.value} onChange={(ev) => field.onChange(ev.target.value.toUpperCase())} className="h-9 w-11 cursor-pointer rounded-md border bg-transparent p-1" />
                    <Input value={field.value} onChange={(ev) => field.onChange(ev.target.value)} className="w-24 font-mono text-xs" aria-label="Colour hex" />
                  </div>
                )} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="r-desc">Description</Label>
              <Input id="r-desc" placeholder="Who gets this role" {...register('description')} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">Badge preview: <RoleChip name={v.name || 'Role'} color={/^#[0-9a-fA-F]{6}$/.test(v.color || '') ? v.color : '#3E63DD'} /></div>
            <div className="grid gap-2">
              <Label>Rights</Label>
              {RIGHTS.map((x) => (
                <Controller key={x.key} control={control} name={x.key} render={({ field }) => (
                  <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                    <span className="leading-tight"><b className="inline-flex items-center gap-1.5 font-medium"><x.icon className="size-3.5" />{x.label}</b><span className="mt-0.5 block text-xs text-muted-foreground">{x.hint}</span></span>
                  </label>
                )} />
              ))}
            </div>
            {(v.createGroups || v.createChannels) && (
              <div className="grid gap-2">
                <Label htmlFor="r-max">Rooms one member may own</Label>
                <Input id="r-max" type="number" min={0} max={100} className="w-28" {...register('maxRooms', { valueAsNumber: true })} />
              </div>
            )}
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor="r-order"><Hash className="inline size-3" /> Order</Label>
                <Input id="r-order" type="number" {...register('order', { setValueAs: (x) => Number(x) || 0 })} />
              </div>
              <Controller control={control} name="isDefault" render={({ field }) => (
                <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} />Default for new accounts</label>
              )} />
            </div>
          </div>
          <SheetFooter className="mt-auto border-t">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{role === 'new' ? 'Create role' : 'Save changes'}</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
