'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { formatDistanceToNowStrict } from 'date-fns'
import { Check, ImageUp, Loader2, Trash2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/backoffice/components/ui/select'
import { LocalizedInput, type Lang } from '@/backoffice/components/localized-input'
import { siteSchema, type SiteForm } from '@/backoffice/lib/forms'
import { saveSiteSettings, setBrandImage } from '@/backoffice/actions/content'

export function SiteSettingsView({
  initial,
  languages,
  partners,
  updatedAt,
  brand,
}: {
  initial: SiteForm
  languages: Lang[]
  partners: { id: string; name: string; active: boolean }[]
  updatedAt: string | null
  brand: { logoUrl: string | null; shareUrl: string | null; heroUrl: string | null; siteUrl: string }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const { register, control, handleSubmit, formState, reset } = useForm<SiteForm>({
    resolver: zodResolver(siteSchema),
    defaultValues: initial,
  })
  const e = formState.errors
  const watched = useWatch({ control })
  const siteName = watched.siteName || 'OddsClub'
  const defLang = languages.find((l) => l.isDefault) || languages[0]
  const desc = (watched.seoDescription || []).find((r) => r?.locale === defLang?.code)?.value || ''

  function onSubmit(d: SiteForm) {
    start(async () => {
      const r = await saveSiteSettings(d)
      if (r.ok) {
        toast.success('Saved. The site uses the new values now.')
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
        title="Site settings"
        description={
          formState.isDirty
            ? 'Unsaved changes'
            : updatedAt
              ? `Saved ${formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true })}`
              : 'General details used across the site.'
        }
      >
        <Button type="submit" disabled={pending || !formState.isDirty}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}Save changes
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Brand &amp; search</CardTitle>
          <CardDescription>
            Your logo is used in the site’s top bar, the chat, this back office, the browser tab, the phone home screen and
            what search engines show. Images save as soon as you pick them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <BrandImage
              kind="logo"
              label="Logo"
              hint="Square works best. SVG, PNG or JPG up to 5 MB; transparent backgrounds are kept."
              url={brand.logoUrl}
              onDone={() => router.refresh()}
            />
            <BrandImage
              kind="share"
              label="Link preview image (optional)"
              hint="Shown when the site is shared on WhatsApp, Facebook, X… Cropped to 1200×630. Without it, one is made from your logo."
              url={brand.shareUrl}
              fallback="/brand/og"
              wide
              onDone={() => router.refresh()}
            />
            <div className="grid gap-2">
              <Label>Search description</Label>
              <Controller
                control={control}
                name="seoDescription"
                render={({ field }) => (
                  <LocalizedInput
                    label="Search description"
                    languages={languages}
                    value={field.value}
                    onChange={field.onChange}
                    textarea
                    placeholder="e.g. Live odds, promo codes and a fan chat for football, basketball, tennis and esports."
                  />
                )}
              />
              <p className={'text-xs ' + (desc.length > 160 ? 'text-warning' : 'text-muted-foreground')}>
                The text under your site name in search results. About 150 characters ({desc.length} in {defLang?.name || 'the default language'}). Empty = the hero headline is used.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Previews</p>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Site top bar</p>
              <div className="flex items-center gap-2.5 rounded-lg bg-[#0D2747] px-4 py-3 text-white">
                <LogoMark url={brand.logoUrl} size={30} />
                <span className="font-[Anton,Impact,sans-serif] text-xl uppercase tracking-wide">{siteName}</span>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Browser tab</p>
              <div className="flex w-fit max-w-full items-center gap-2 rounded-t-lg border border-b-0 bg-muted/60 px-3 py-2 text-sm">
                <LogoMark url={brand.logoUrl} size={16} />
                <span className="truncate">{siteName}</span>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Search result</p>
              <div className="rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-full border bg-white"><LogoMark url={brand.logoUrl} size={18} /></span>
                  <div className="min-w-0 leading-tight">
                    <div className="text-sm">{siteName}</div>
                    <div className="truncate text-xs text-muted-foreground">{brand.siteUrl.replace(/^https?:\/\//, '')} › {defLang?.code || 'en'}</div>
                  </div>
                </div>
                <div className="mt-1.5 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{siteName}</div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{desc || 'Every sport. One code. Join with our promo code, then follow live odds…'}</p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Shared link</p>
              <div className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.shareUrl || `/brand/og?v=${encodeURIComponent(brand.logoUrl || 'default')}`} alt="" className="aspect-[1200/630] w-full object-cover" />
                <div className="bg-muted/50 px-3 py-2">
                  <div className="text-xs uppercase text-muted-foreground">{brand.siteUrl.replace(/^https?:\/\//, '')}</div>
                  <div className="text-sm font-semibold">{siteName}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{desc || 'Every sport. One code.'}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>First screen picture</CardTitle>
          <CardDescription>
            A big picture of a person on the left of the first screen, in front of the headline (the phone stays in front of
            it). Use a cut-out with no background. It saves as soon as you pick it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <BrandImage
            kind="hero"
            label="Person picture"
            hint="PNG or WebP with a transparent background, at least 1200 px tall, up to 10 MB. Empty space around the person is trimmed automatically; the feet fade into the background."
            url={brand.heroUrl}
            onDone={() => router.refresh()}
          />
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Preview (desktop)</p>
            <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-[radial-gradient(70%_60%_at_50%_30%,#2F5480,#0D2747)]">
              <div className="absolute inset-0 flex flex-col items-center justify-center font-[Anton,Impact,sans-serif] uppercase leading-[.86] text-white" style={{ fontSize: 'clamp(28px,4.2vw,64px)' }}>
                <span>Every sport.</span>
                <span className="text-[#7DB342]">One code.</span>
              </div>
              {brand.heroUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.heroUrl} alt="" className="absolute bottom-0 left-[2%] h-[86%] max-w-[44%] object-contain object-left-bottom [mask-image:linear-gradient(to_top,transparent_0,#000_26%)]" />
              )}
              <div className="absolute left-1/2 top-1/2 h-[62%] w-[17%] -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] rounded-[14%] border-4 border-[#123460] bg-[#0F2C52] shadow-2xl" />
              <div className="absolute bottom-[6%] left-[3%] h-1.5 w-[22%] rounded bg-white/40" />
              <div className="absolute bottom-[5%] right-[3%] h-[7%] w-[20%] rounded-md bg-[#7DB342]" />
              {!brand.heroUrl && <span className="absolute bottom-[18%] left-[4%] rounded bg-black/40 px-2 py-1 text-xs text-white">Your picture appears here</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>The site name and what first-time visitors see.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="siteName">Site name</Label>
              <Input id="siteName" aria-invalid={!!e.siteName} {...register('siteName')} />
              {e.siteName && <p className="text-xs text-destructive">{e.siteName.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Default partner</Label>
              <Controller
                control={control}
                name="defaultPartner"
                render={({ field }) => (
                  <Select
                    value={field.value || 'none'}
                    onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">First partner in the list</SelectItem>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.active ? '' : ' (hidden)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Shown to visitors who haven’t picked one yet.
              </p>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="agentName">Team name in the chat</Label>
              <Input id="agentName" placeholder="OddsClub team" {...register('agentName')} />
              <p className="text-xs text-muted-foreground">
                What fans see as the name of their direct chat with your team (and as a reserved
                name nobody can take).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Footer</CardTitle>
            <CardDescription>
              Legal lines at the bottom of every page, per language. A dot marks a missing
              translation.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label>Gambling helpline</Label>
              <Controller
                control={control}
                name="helpline"
                render={({ field }) => (
                  <LocalizedInput
                    label="Gambling helpline"
                    languages={languages}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. BeGambleAware.org · 0808 8020 133"
                  />
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label>Company / licence line</Label>
              <Controller
                control={control}
                name="companyLine"
                render={({ field }) => (
                  <LocalizedInput
                    label="Company / licence line"
                    languages={languages}
                    value={field.value}
                    onChange={field.onChange}
                    textarea
                  />
                )}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}

function LogoMark({ url, size }: { url: string | null; size: number }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size }} className="shrink-0 object-contain" />
  return (
    <span className="grid shrink-0 place-items-center rounded-[28%] bg-[#2F6FE0]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" style={{ width: size * 0.6, height: size * 0.6 }} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
      </svg>
    </span>
  )
}

/** Upload / replace / remove one brand image; saved immediately (not part of the form). */
function BrandImage({ kind, label, hint, url, fallback, wide, onDone }: { kind: 'logo' | 'share' | 'hero'; label: string; hint: string; url: string | null; fallback?: string; wide?: boolean; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  function upload(file: File | null) {
    const max = kind === 'hero' ? 10 : 5
    if (file && file.size > max * 1024 * 1024) { toast.error(`That image is over ${max} MB.`); return }
    const fd = new FormData()
    if (file) { fd.set('file', file); setPreview(URL.createObjectURL(file)) }
    start(async () => {
      const r = await setBrandImage(kind, file ? fd : null)
      const name = label.replace(/ \(optional\)/, '')
      if (r.ok) {
        toast.success(file ? `${name} saved` : `${name} removed`)
        if (file && kind === 'hero' && r.data && r.data.transparent === false) toast.warning('This picture still has a background, so it will show as a rectangle. Use a PNG or WebP cut-out with a transparent background (e.g. made with a background remover).', { duration: 9000 })
        onDone()
      } else toast.error(r.error)
      setPreview(null)
    })
  }
  const shown = preview || url || fallback || null
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-4">
        <div className={'relative grid shrink-0 place-items-center overflow-hidden rounded-lg border bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px] ' + (kind === 'hero' ? 'h-40 w-28' : wide ? 'aspect-[1200/630] w-48' : 'size-20')}>
          {shown
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={shown} alt="" className={'size-full ' + (wide ? 'object-cover' : 'object-contain p-1.5')} />
            : kind === 'hero' ? <span className="px-2 text-center text-xs text-muted-foreground">No picture</span> : <LogoMark url={null} size={48} />}
          {pending && <span className="absolute inset-0 grid place-items-center bg-background/60"><Loader2 className="size-5 animate-spin" /></span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}><ImageUp />{url ? 'Replace' : 'Upload'}</Button>
          {url && <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => upload(null)}><Trash2 />Remove</Button>}
        </div>
        <input ref={input} type="file" hidden accept={kind === 'hero' ? 'image/png,image/webp,image/avif' : 'image/svg+xml,image/png,image/jpeg,image/webp'} onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) upload(f) }} />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
