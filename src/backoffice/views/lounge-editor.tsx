'use client'
import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowLeft, Check, ExternalLink, Loader2, Megaphone, MessagesSquare, Users } from 'lucide-react'
import { Button } from '@/backoffice/components/ui/button'
import { Badge } from '@/backoffice/components/ui/badge'
import { Label } from '@/backoffice/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/backoffice/components/ui/card'
import { LocalizedInput, type Lang } from '@/backoffice/components/localized-input'
import { loungeSchema, type LoungeForm } from '@/backoffice/lib/forms'
import { saveLounge } from '@/backoffice/actions/groups'
import { MediaFields } from './group-fields'

const POST_BY = [
  { value: 'everyone', label: 'Everyone', hint: 'Every signed-in member who accepted the house rules can write here.', icon: Users },
  { value: 'team', label: 'The team only', hint: 'An announcements room: only moderators post; members read and react.', icon: Megaphone },
] as const

/** The chat's built-in "Community lounge": always there, everyone can read it. Texts per language + who can post. */
export function LoungeEditor({ languages, defaults, messages, updatedAt, initial }: {
  languages: Lang[]; defaults: Record<string, Record<string, string>>; messages: number; updatedAt: string | null; initial: LoungeForm
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const { control, handleSubmit, formState, reset } = useForm<LoungeForm>({ resolver: zodResolver(loungeSchema), defaultValues: initial })
  const v = useWatch({ control }) as LoungeForm
  const def = languages.find((l) => l.isDefault)?.code || languages[0]?.code || 'en'
  const pick = (rows: LoungeForm['name'], key: string) => rows?.find((r) => r.locale === def)?.value?.trim() || defaults[key]?.[def] || ''
  const name = pick(v.name, 'chat.lounge') || 'Community lounge'
  const sub = pick(v.subtitle, 'chat.loungeSub')
  const desc = pick(v.description, 'lounge.info')

  function onSubmit(d: LoungeForm) {
    start(async () => {
      const r = await saveLounge(d)
      if (r.ok) { toast.success('Saved. Visitors see it on their next page load.'); reset(d); router.refresh() } else toast.error(r.error)
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error('Some fields need fixing'))} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/admin/groups" aria-label="Back to groups"><ArrowLeft /></Link></Button>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#7DB342] text-white"><Users className="size-5" /></span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-2xl font-semibold tracking-tight">{name}<Badge variant="secondary">Built-in</Badge></h1>
            <p className="text-sm text-muted-foreground">
              The chat’s main room · {messages} message{messages === 1 ? '' : 's'} · {formState.isDirty ? 'Unsaved changes' : updatedAt ? `Saved ${formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true })}` : 'Default settings'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" asChild><a href={`/${def}/chat/lounge`} target="_blank" rel="noopener"><ExternalLink />Open in the chat</a></Button>
          <Button type="submit" disabled={pending || !formState.isDirty}>{pending ? <Loader2 className="animate-spin" /> : <Check />}Save changes</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Texts</CardTitle>
              <CardDescription>Per language. Leave a field empty to keep the default wording (shown in grey).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-2">
                <Label>Chat title</Label>
                <Controller control={control} name="chatTitle" render={({ field }) => (
                  <LocalizedInput label="Chat title" languages={languages} value={field.value} onChange={field.onChange} placeholders={defaults['chat.title']} optional />
                )} />
                <p className="text-xs text-muted-foreground">The big title at the top of the chat’s room list (and in the browser tab), above every room — not only the lounge.</p>
              </div>
              <div className="grid gap-2">
                <Label>Lounge name</Label>
                <Controller control={control} name="name" render={({ field }) => (
                  <LocalizedInput label="Name" languages={languages} value={field.value} onChange={field.onChange} placeholders={defaults['chat.lounge']} optional />
                )} />
                <p className="text-xs text-muted-foreground">In the chat’s room list and header, on the home page card and on the 3D phone.</p>
              </div>
              <div className="grid gap-2">
                <Label>Subtitle</Label>
                <Controller control={control} name="subtitle" render={({ field }) => (
                  <LocalizedInput label="Subtitle" languages={languages} value={field.value} onChange={field.onChange} placeholders={defaults['chat.loungeSub']} optional />
                )} />
                <p className="text-xs text-muted-foreground">Under the name in the room header (e.g. who it is for).</p>
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Controller control={control} name="description" render={({ field }) => (
                  <LocalizedInput label="Description" languages={languages} value={field.value} onChange={field.onChange} placeholders={defaults['lounge.info']} textarea optional />
                )} />
                <p className="text-xs text-muted-foreground">On the home page’s chat card and in the room list before anyone has written.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pictures & voice messages</CardTitle>
              <CardDescription>Who can see them in the lounge and the match rooms, and whether they can be saved.</CardDescription>
            </CardHeader>
            <CardContent>
              <Controller control={control} name="mediaView" render={({ field }) => (
                <Controller control={control} name="mediaSave" render={({ field: save }) => (
                  <MediaFields scope="lounge" view={field.value} onView={field.onChange} save={save.value} onSave={save.onChange} />
                )} />
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who can post</CardTitle>
              <CardDescription>Everyone can always read the lounge and react to messages. The house rules and banned words (Chat settings) apply here too.</CardDescription>
            </CardHeader>
            <CardContent>
              <Controller control={control} name="postBy" render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who can post">
                  {POST_BY.map((o) => (
                    <button key={o.value} type="button" role="radio" aria-checked={field.value === o.value} onClick={() => field.onChange(o.value)}
                      className={'flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors ' + (field.value === o.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50')}>
                      <o.icon className="mt-0.5 size-4 shrink-0" />
                      <span className="leading-tight"><b className="font-medium">{o.label}</b><span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span></span>
                    </button>
                  ))}
                </div>
              )} />
            </CardContent>
          </Card>
        </div>

        {/* how it looks in the chat's room list and on the home page card */}
        <div className="flex flex-col gap-3 xl:sticky xl:top-20">
          <p className="text-sm font-medium">Preview</p>
          <div className="rounded-xl border bg-[#0D2747] p-3 text-white">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">Chat · room list</p>
            <p className="mb-2 font-[Anton,Impact,sans-serif] text-xl uppercase leading-none">{pick(v.chatTitle, 'chat.title') || 'Community'}</p>
            <div className="flex items-center gap-3 rounded-lg bg-white/10 p-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#7DB342]"><Users className="size-5" /></span>
              <span className="min-w-0 leading-tight"><b className="block truncate text-sm">{name}</b><span className="block truncate text-xs text-white/60">{desc || '—'}</span></span>
            </div>
            <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-white/50">Chat · room header</p>
            <div className="flex items-center gap-3 rounded-lg border border-white/10 p-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#7DB342]"><Users className="size-4" /></span>
              <span className="min-w-0 leading-tight"><b className="block truncate text-sm">{name}</b><span className="block truncate text-xs text-white/60">{v.postBy === 'team' && !v.subtitle?.find((r) => r.locale === def)?.value?.trim() ? 'Announcements · the team posts' : sub || '—'}</span></span>
            </div>
            {v.postBy === 'team' && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-white/10 p-2.5 text-xs text-white/80"><MessagesSquare className="size-4 shrink-0" />Members see: “Only the team posts in the lounge. You can react to messages.”</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Shown in {languages.find((l) => l.code === def)?.name || 'the default language'}.</p>
        </div>
      </div>
    </form>
  )
}
