'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowDown, ArrowUp, Check, Eraser, Forward, ImageIcon, Loader2, Mic, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/backoffice/components/ui/card'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { Switch } from '@/backoffice/components/ui/switch'
import { Textarea } from '@/backoffice/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/backoffice/components/ui/select'
import { LocalizedInput, type Lang } from '@/backoffice/components/localized-input'
import { RULE_ICONS } from '@/lib/options'
import { chatSchema, type ChatForm } from '@/backoffice/lib/forms'
import { runMediaCleanupNow, saveChatSettings } from '@/backoffice/actions/content'

// the same stroke icons the chat draws in the house rules sheet
const ICON_PATHS: Record<string, React.ReactNode> = {
  age: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 9v6M11 9h3v3h-3v3h3" />
    </>
  ),
  heart: <path d="M12 21c-5-3-8-6.5-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 3.5-3 7-8 10z" />,
  nolink: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      <path d="M4 4l16 16" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7z" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  tag: (
    <>
      <path d="M20 12l-8 8-9-9V3h8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
      <path d="M4 20L20 4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 4.5h-5L8 10z" />
    </>
  ),
}
const RuleIcon = ({ name }: { name: string }) => (
  <svg
    viewBox="0 0 24 24"
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ICON_PATHS[name] || ICON_PATHS.shield}
  </svg>
)

type Usage = { count: number; bytes: number; oldest: string | null }
const mb = (b: number) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')

export function ChatSettingsView({
  initial,
  languages,
  updatedAt,
  usage,
}: {
  initial: ChatForm
  languages: Lang[]
  updatedAt: string | null
  usage?: { pictures: Usage; voices: Usage }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const { register, control, handleSubmit, formState, reset } = useForm<ChatForm>({
    resolver: zodResolver(chatSchema),
    defaultValues: initial,
  })
  const rules = useFieldArray({ control, name: 'rules' })
  const words = useWatch({ control, name: 'bannedWords' }) || ''
  const days = useWatch({ control, name: 'mediaRetentionDays' })
  const [cleaning, startClean] = useTransition()
  const wordCount = new Set(
    words
      .split(/[\n,]+/)
      .map((w) => w.trim())
      .filter(Boolean),
  ).size
  const e = formState.errors
  const empty = () => languages.map((l) => ({ locale: l.code, value: '' }))

  function onSubmit(d: ChatForm) {
    start(async () => {
      const r = await saveChatSettings(d)
      if (r.ok) {
        toast.success('Saved. Open chats use the new settings for new messages.')
        reset(d)
        router.refresh()
      } else toast.error(r.error)
    })
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit, () => toast.error('Some fields need fixing'))}
      className="flex flex-col gap-6"
      noValidate
    >
      <PageHeader
        title="Chat settings"
        description={
          formState.isDirty
            ? 'Unsaved changes'
            : updatedAt
              ? `Saved ${formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true })}`
              : 'Limits, house rules and banned words for the community chat.'
        }
      >
        <Button type="submit" disabled={pending || !formState.isDirty}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}Save changes
        </Button>
      </PageHeader>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>House rules</CardTitle>
              <CardDescription>
                Shown in the rules sheet; members accept them before posting. A dot marks a missing
                translation.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {rules.fields.map((f, i) => (
                <div key={f.id} className="grid gap-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Rule {i + 1}</span>
                    <Controller
                      control={control}
                      name={`rules.${i}.icon`}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger size="sm" className="w-44" aria-label="Icon">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RULE_ICONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                <RuleIcon name={o.value} />
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <div className="ml-auto flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => rules.move(i, i - 1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move down"
                        disabled={i === rules.fields.length - 1}
                        onClick={() => rules.move(i, i + 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Remove rule ${i + 1}`}
                        onClick={() => rules.remove(i)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Title</Label>
                    <Controller
                      control={control}
                      name={`rules.${i}.title`}
                      render={({ field }) => (
                        <LocalizedInput
                          label={`Rule ${i + 1} title`}
                          languages={languages}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Explanation</Label>
                    <Controller
                      control={control}
                      name={`rules.${i}.body`}
                      render={({ field }) => (
                        <LocalizedInput
                          label={`Rule ${i + 1} explanation`}
                          languages={languages}
                          value={field.value}
                          onChange={field.onChange}
                          textarea
                        />
                      )}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => rules.append({ icon: 'shield', title: empty(), body: empty() })}
              >
                <Plus />
                Add rule
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-6 xl:sticky xl:top-20">
          <Card>
            <CardHeader>
              <CardTitle>Limits</CardTitle>
              <CardDescription>
                Apply to members. The partner team is never slowed down.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="grid gap-2">
                <Label htmlFor="slow">Slow mode (seconds between messages)</Label>
                <Input
                  id="slow"
                  type="number"
                  min={0}
                  max={120}
                  inputMode="numeric"
                  aria-invalid={!!e.slowModeSeconds}
                  {...register('slowModeSeconds', { valueAsNumber: true })}
                />
                {e.slowModeSeconds ? (
                  <p className="text-xs text-destructive">{e.slowModeSeconds.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">0 turns slow mode off.</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxlen">Longest message (characters)</Label>
                <Input
                  id="maxlen"
                  type="number"
                  min={50}
                  max={2000}
                  inputMode="numeric"
                  aria-invalid={!!e.maxLength}
                  {...register('maxLength', { valueAsNumber: true })}
                />
                {e.maxLength && <p className="text-xs text-destructive">{e.maxLength.message}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Private chats</CardTitle>
              <CardDescription>What members can send each other in private chats. The chat with your team always allows pictures and voice messages.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Controller control={control} name="pmPictures" render={({ field }) => (
                <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                  <span className="leading-tight"><b className="font-medium"><ImageIcon className="mr-1 inline size-3.5" />Pictures</b>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{field.value ? 'Members can send pictures to each other.' : 'Off: the picture button is hidden in private chats.'}</span></span>
                </label>
              )} />
              <Controller control={control} name="pmVoice" render={({ field }) => (
                <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                  <span className="leading-tight"><b className="font-medium"><Mic className="mr-1 inline size-3.5" />Voice messages</b>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{field.value ? 'Members can send voice messages to each other.' : 'Off: the microphone is hidden in private chats.'}</span></span>
                </label>
              )} />
              <Controller control={control} name="pmForward" render={({ field }) => (
                <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                  <span className="leading-tight"><b className="font-medium"><Forward className="mr-1 inline size-3.5" />Forwarding</b>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{field.value ? 'Messages of private chats can be forwarded to other chats.' : 'Off: messages of private chats can’t be forwarded.'}</span></span>
                </label>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Voice messages & media storage</CardTitle>
              <CardDescription>Pictures and voice messages are stored in your file storage (Cloudflare R2). Old ones can be deleted automatically; the messages stay, marked “expired”.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="voicemax"><Mic className="inline size-3.5" /> Longest voice message (seconds)</Label>
                <Input id="voicemax" type="number" min={10} max={600} inputMode="numeric" aria-invalid={!!e.voiceMaxSeconds} {...register('voiceMaxSeconds', { valueAsNumber: true })} />
                {e.voiceMaxSeconds ? <p className="text-xs text-destructive">{e.voiceMaxSeconds.message}</p> : <p className="text-xs text-muted-foreground">Recording stops and sends by itself at this length.</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="retention"><Eraser className="inline size-3.5" /> Delete pictures and voice messages after (days)</Label>
                <Input id="retention" type="number" min={0} max={3650} inputMode="numeric" aria-invalid={!!e.mediaRetentionDays} {...register('mediaRetentionDays', { valueAsNumber: true })} />
                {e.mediaRetentionDays ? <p className="text-xs text-destructive">{e.mediaRetentionDays.message}</p> : (
                  <p className="text-xs text-muted-foreground">{!days ? '0 keeps everything forever.' : `Files older than ${days} day${days === 1 ? '' : 's'} are deleted (checked every 6 hours). Profile photos, logos and partner pictures are never touched.`}</p>
                )}
              </div>
              {usage && (
                <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
                  <span className="flex items-center gap-2"><ImageIcon className="size-4 text-muted-foreground" />{usage.pictures.count} picture{usage.pictures.count === 1 ? '' : 's'} · {mb(usage.pictures.bytes)}{usage.pictures.oldest ? ` · oldest ${formatDistanceToNowStrict(new Date(usage.pictures.oldest), { addSuffix: true })}` : ''}</span>
                  <span className="flex items-center gap-2"><Mic className="size-4 text-muted-foreground" />{usage.voices.count} voice message{usage.voices.count === 1 ? '' : 's'} · {mb(usage.voices.bytes)}{usage.voices.oldest ? ` · oldest ${formatDistanceToNowStrict(new Date(usage.voices.oldest), { addSuffix: true })}` : ''}</span>
                </div>
              )}
              <Button type="button" variant="outline" className="w-fit" disabled={cleaning || formState.isDirty || !initial.mediaRetentionDays}
                title={formState.isDirty ? 'Save your changes first' : !initial.mediaRetentionDays ? 'Set a number of days and save first' : undefined}
                onClick={() => startClean(async () => { const r = await runMediaCleanupNow(); if (r.ok && r.data) { toast.success(r.data.pictures + r.data.voices ? `Deleted ${r.data.pictures} picture(s) and ${r.data.voices} voice message(s) · ${mb(r.data.freedBytes)} freed` : 'Nothing old enough to delete'); router.refresh() } else if (!r.ok) toast.error(r.error) })}>
                {cleaning ? <Loader2 className="animate-spin" /> : <Eraser />}Run clean-up now
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Banned words</CardTitle>
              <CardDescription>
                One per line. Messages and usernames containing them are refused, also when written
                with tricks like 1d10t or $h1t.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Textarea
                rows={8}
                className="font-mono text-sm"
                aria-label="Banned words, one per line"
                {...register('bannedWords')}
              />
              <p className="text-xs text-muted-foreground">
                {wordCount} word{wordCount === 1 ? '' : 's'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
