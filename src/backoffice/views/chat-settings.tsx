'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from 'lucide-react'
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
import { saveChatSettings } from '@/backoffice/actions/content'

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

export function ChatSettingsView({
  initial,
  languages,
  updatedAt,
}: {
  initial: ChatForm
  languages: Lang[]
  updatedAt: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const { register, control, handleSubmit, formState, reset } = useForm<ChatForm>({
    resolver: zodResolver(chatSchema),
    defaultValues: initial,
  })
  const rules = useFieldArray({ control, name: 'rules' })
  const words = useWatch({ control, name: 'bannedWords' }) || ''
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
                Shown in the rules sheet; fans accept them before posting. A dot marks a missing
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
                Apply to fans. The partner team is never slowed down.
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
