'use client'
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Ban, EyeOff, Globe, Hash, Lock, Megaphone, MessagesSquare, Shield, UserCheck, Users } from 'lucide-react'
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
  open: { label: 'Join directly', hint: 'One tap and they’re in', icon: Hash },
  request: { label: 'Ask to join', hint: 'They send a request; an admin accepts or declines', icon: UserCheck },
  invite: { label: 'Invite only', hint: 'Only people you invite (or who have the invite link)', icon: Lock },
} as const
export const VISIBILITY = {
  public: { label: 'Everyone', hint: 'Also visitors who are not signed in', icon: Globe },
  members: { label: 'Signed-in members', hint: 'Visitors don’t see it', icon: Users },
  hidden: { label: 'Only its members', hint: 'Hidden from everyone else (invited people see it)', icon: EyeOff },
} as const

export function GroupAvatar({ gradient, kind, size = 36, photo = null }: { gradient: string | null; kind: 'group' | 'channel'; size?: number; photo?: string | null }) {
  const Icon = kind === 'channel' ? Megaphone : Users
  // eslint-disable-next-line @next/next/no-img-element
  if (photo) return <img src={photo} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-white" style={{ width: size, height: size, background: gradient || 'linear-gradient(135deg,#3E63DD,#8E4EC6)' }}>
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} />
    </span>
  )
}

/** Who may see pictures / voice messages in a room (+ saving). Shared by groups & channels and the Community lounge. */
export const mediaViews = (scope: 'lounge' | 'group') => ({
  everyone: { label: 'Everyone', hint: scope === 'lounge' ? 'Also visitors who are not signed in' : 'Everyone who can read the room', icon: Globe },
  members: { label: scope === 'lounge' ? 'Signed-in members' : 'Members of the room', hint: scope === 'lounge' ? 'Visitors see a lock' : 'People who joined; others see a lock', icon: Users },
  team: { label: 'The team only', hint: 'Members see a lock', icon: Shield },
  none: { label: 'Nobody (text only)', hint: 'No pictures or voice messages can be sent here', icon: Ban },
})
export function MediaFields({ view, onView, save, onSave, scope }: { view: string; onView: (v: 'everyone' | 'members' | 'team' | 'none') => void; save: boolean; onSave: (v: boolean) => void; scope: 'lounge' | 'group' }) {
  return (
    <div className="grid gap-3">
      <Choice value={view as 'everyone'} onChange={onView} options={mediaViews(scope)} />
      <label className={'flex items-start gap-3 rounded-lg border p-3 text-sm ' + (view === 'none' ? 'opacity-50' : '')}>
        <Switch checked={save} onCheckedChange={onSave} disabled={view === 'none'} className="mt-0.5" />
        <span className="leading-tight"><b className="font-medium">Allow saving pictures and voice messages</b>
          <span className="mt-0.5 block text-xs text-muted-foreground">Off: no Save button, no right-click / long-press saving. Screenshots and screen recordings can never be prevented on a website. The team can always save.</span></span>
      </label>
      <p className="text-xs text-muted-foreground">Enforced by the server: people who may not see a picture never receive it. The team always sees everything (moderation).</p>
    </div>
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
        <Input id="g-name" placeholder="e.g. VIP bonus group" aria-invalid={!!errors.name} {...register('name')} />
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
        <Label>Who can see it</Label>
        <Controller control={control} name="visibility" render={({ field }) => <Choice value={field.value} onChange={field.onChange} options={VISIBILITY} />} />
      </div>
      <Controller control={control} name="visibility" render={({ field: vis }) => (
        <Controller control={control} name="preview" render={({ field }) => (
          <label className={'flex items-start gap-3 rounded-lg border p-3 text-sm ' + (vis.value === 'hidden' ? 'opacity-60' : '')}>
            <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
            <span className="leading-tight"><b className="font-medium">Can read before joining</b>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {vis.value === 'hidden' ? 'Only people who were invited or asked to join would read it before accepting.' : 'People who see the room can read the messages without joining. Off: they see its name, description and members, and must join to read.'}
              </span></span>
          </label>
        )} />
      )} />
      <div className="grid gap-2">
        <Label>How people join</Label>
        <Controller control={control} name="join" render={({ field }) => <Choice value={field.value} onChange={field.onChange} options={JOIN} />} />
        <p className="text-xs text-muted-foreground">Whatever you choose, people you invite by name or with the invite link can always join. The team can read and post everywhere.</p>
      </div>
      <Controller control={control} name="autoAdd" render={({ field }) => (
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
          <span className="leading-tight"><b className="font-medium">Add new members automatically</b><span className="mt-0.5 block text-xs text-muted-foreground">Every account created from now on joins this room. Existing accounts: use “Add all members” on the room page.</span></span>
        </label>
      )} />
      <div className="grid gap-2">
        <Label>Pictures & voice messages</Label>
        <Controller control={control} name="mediaView" render={({ field }) => (
          <Controller control={control} name="mediaSave" render={({ field: save }) => (
            <MediaFields scope="group" view={field.value} onView={field.onChange} save={save.value} onSave={save.onChange} />
          )} />
        )} />
      </div>
      <Controller control={control} name="allowForward" render={({ field }) => (
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
          <span className="leading-tight"><b className="font-medium">Forwarding</b><span className="mt-0.5 block text-xs text-muted-foreground">{field.value ? 'Members can forward its messages to their other chats (marked “Forwarded”).' : 'Off: its messages can’t be forwarded. The team always can.'}</span></span>
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
