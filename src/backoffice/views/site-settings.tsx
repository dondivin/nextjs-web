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
import { saveSiteSettings } from '@/backoffice/actions/content'
import { BrandImage, LogoMark } from './brand-image'

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
  brand: { logoUrl: string | null; iconUrl: string | null; iconV: string; shareUrl: string | null; siteUrl: string }
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
              kind="icon"
              label="Browser tab icon (optional)"
              hint="A small square mark (e.g. just your symbol or first letter) for the browser tab, phone home screen and search results — a full wordmark is unreadable at 16 px. Empty margins are trimmed. Without it, the icon is made from your logo on a dark tile (see the previews)."
              url={brand.iconUrl}
              fallback={`/brand/icon/192?v=${brand.iconV}`}
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
                    placeholder="e.g. Promo codes and bonuses from our partner bookmakers, live odds and a community chat."
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
              <p className="mb-1.5 text-xs text-muted-foreground">Browser tab (the real icon, light and dark)</p>
              <div className="flex flex-wrap gap-2">
                {[['bg-[#f1f3f4] text-[#202124] border-[#dadce0]', 'light'], ['bg-[#35363a] text-[#e8eaed] border-[#4a4b4f]', 'dark']].map(([cls, k]) => (
                  <div key={k} className={'flex w-fit max-w-full items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-sm ' + cls}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/brand/icon/32?v=${brand.iconV}`} alt="" width={16} height={16} className="size-4" />
                    <span className="truncate">{siteName}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Search result</p>
              <div className="rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <span className="grid size-7 place-items-center overflow-hidden rounded-full border bg-white"><img src={`/brand/icon/48?v=${brand.iconV}`} alt="" width={18} height={18} className="size-[18px]" /></span>
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
                What members see as the name of their direct chat with your team (and as a reserved
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
