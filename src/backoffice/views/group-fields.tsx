'use client'
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Hash, Lock, Megaphone, MessagesSquare, UserCheck, Users } from 'lucide-react'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { Switch } from '@/backoffice/components/ui/switch'
import { Textarea } from '@/backoffice/components/ui/textarea'
import type { GroupForm } from '@/backoffice/lib/forms'

/** Labels shared by the list and the editor. */
export const KIND = {
  group: { label: 'Group', hint: 'Every member can post', icon: MessagesSquare },
  channel: { label: 'Channel', hint: 'Only the team posts; members read and react', icon: Megaphone },
} as const
export const JOIN = {
  open: { label: 'Open', hint: 'Anyone can read; one tap to join and post', icon: Hash },
  request: { label: 'Request to join', hint: 'Everyone sees it; you approve who gets in', icon: UserCheck },
  invite: { label: 'Invite only', hint: 'Hidden; only people you invite see it', icon: Lock },
} as const

export function GroupAvatar({ gradient, kind, size = 36 }: { gradient: string | null; kind: 'group' | 'channel'; size?: number }) {
  const Icon = kind === 'channel' ? Megaphone : Users
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-white" style={{ width: size, height: size, background: gradient || 'linear-gradient(135deg,#3E63DD,#8E4EC6)' }}>
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} />
    </span>
  )
}

function Choice<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Record<T, { label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]" role="radiogroup">
      {(Object.keys(options) as T[]).map((k) => {
        const o = options[k], on = value === k
        return (
          <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onChange(k)}
            className={'flex items-start gap-2.5 rounded-lg border p-3 text-left text-sm transition-colors ' + (on ? 'border-brand bg-brand/10' : 'hover:bg-muted/60')}>
            <o.icon className={'mt-0.5 size-4 shrink-0 ' + (on ? 'text-brand' : 'text-muted-foreground')} />
            <span className="leading-tight"><b className="font-medium">{o.label}</b><span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span></span>
          </button>
        )
      })}
    </div>
  )
}

/** The room settings, used by the "new room" sheet and the room page. */
export function GroupFields({ control, register, errors }: { control: Control<GroupForm>; register: UseFormRegister<GroupForm>; errors: FieldErrors<GroupForm> }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="g-name">Name</Label>
        <Input id="g-name" placeholder="e.g. Premier League fans" aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="g-desc">Description</Label>
        <Textarea id="g-desc" rows={2} placeholder="What this room is about" {...register('description')} />
      </div>
      <div className="grid gap-2">
        <Label>Kind</Label>
        <Controller control={control} name="kind" render={({ field }) => <Choice value={field.value} onChange={field.onChange} options={KIND} />} />
      </div>
      <div className="grid gap-2">
        <Label>Who can join</Label>
        <Controller control={control} name="join" render={({ field }) => <Choice value={field.value} onChange={field.onChange} options={JOIN} />} />
      </div>
      <Controller control={control} name="autoAdd" render={({ field }) => (
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
          <span className="leading-tight"><b className="font-medium">Add new members automatically</b><span className="mt-0.5 block text-xs text-muted-foreground">Every account created from now on joins this room. Existing accounts: use “Add all members” on the room page.</span></span>
        </label>
      )} />
      <div className="grid gap-2">
        <Label htmlFor="g-rules">Room rules (optional)</Label>
        <Textarea id="g-rules" rows={3} placeholder="Shown at the top of the room, on top of the site’s house rules" {...register('rules')} />
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="g-order">Order in the list</Label>
          <Input id="g-order" type="number" inputMode="numeric" {...register('order', { setValueAs: (v) => Number(v) || 0 })} />
        </div>
        <Controller control={control} name="active" render={({ field }) => (
          <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} />Shown in the chat</label>
        )} />
      </div>
    </div>
  )
}
