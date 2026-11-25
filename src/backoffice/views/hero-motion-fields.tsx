'use client'
import { Controller, useWatch, type Control, type FieldErrors } from 'react-hook-form'
import { ArrowLeft, ArrowRight, Play, RotateCcw } from 'lucide-react'
import { Switch } from '@/backoffice/components/ui/switch'
import { useHeroSwitch } from '@/backoffice/lib/use-hero-switch'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/backoffice/components/ui/toggle-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/backoffice/components/ui/select'
import type { PartnerForm } from '@/backoffice/lib/partner-schema'
import { HERO_EASINGS, HERO_MOTION_DEFAULT, HERO_STYLES, heroMotionOf } from '@/lib/hero-motion'

type Colors = PartnerForm['colors']

/**
 * "Switch animation" for one partner's first-screen picture: how it arrives when the site switches to this partner.
 * The preview plays the same keyframes as the site (src/site/engine/engine.ts → swapHero), scaled to the preview's width.
 */
export function HeroMotionFields({ control, errors, heroUrl, colors, onReset }: { control: Control<PartnerForm>; errors?: FieldErrors<PartnerForm>['heroMotion']; heroUrl: string | null; colors: Colors; onReset: () => void }) {
  const m = heroMotionOf(useWatch({ control, name: 'heroMotion' }))
  const style = HERO_STYLES.find((s) => s.value === m.style)
  const easing = HERO_EASINGS.find((e) => e.value === m.easing)
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Switch animation</p>
          <p className="text-xs text-muted-foreground">How the picture changes when visitors switch to this partner. Saved with “Save changes”.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}><RotateCcw />Default</Button>
      </div>

      <div className="grid gap-2">
        <Label>Style</Label>
        <Controller control={control} name="heroMotion.style" render={({ field }) => (
          <ToggleGroup type="single" variant="outline" value={field.value} onValueChange={(v) => v && field.onChange(v)} className="w-full sm:w-fit">
            {HERO_STYLES.map((s) => <ToggleGroupItem key={s.value} value={s.value} className="px-4">{s.label}</ToggleGroupItem>)}
          </ToggleGroup>
        )} />
        <p className="text-xs text-muted-foreground">{style?.hint}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Seconds control={control} name="heroMotion.enterMs" label="Arrival time" hint="How long the new picture takes to arrive" error={errors?.enterMs?.message} />
        <Seconds control={control} name="heroMotion.exitMs" label="Leaving time" hint="How long the previous picture takes to leave" error={errors?.exitMs?.message} />
        <Seconds control={control} name="heroMotion.delayMs" label="Delay" hint="Wait before the new picture starts (the two overlap)" error={errors?.delayMs?.message} />
        <div className="grid gap-1.5">
          <Label htmlFor="hm-distance">Distance</Label>
          <Controller control={control} name="heroMotion.distance" render={({ field }) => (
            <div className="flex items-center gap-2">
              <Input id="hm-distance" type="number" min={0} max={400} step={10} className="w-28" disabled={m.style === 'fade'}
                value={Number.isFinite(field.value) ? field.value : ''} onChange={(e) => field.onChange(e.target.value === '' ? NaN : Math.round(Number(e.target.value)))} onBlur={field.onBlur} aria-invalid={!!errors?.distance} />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          )} />
          <p className={'text-xs ' + (errors?.distance ? 'text-destructive' : 'text-muted-foreground')}>{errors?.distance?.message || (m.style === 'fade' ? 'Not used by Fade' : 'How far it travels')}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Easing</Label>
        <Controller control={control} name="heroMotion.easing" render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>{HERO_EASINGS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
        )} />
        <p className="text-xs text-muted-foreground">{easing?.hint}</p>
      </div>

      <Preview heroUrl={heroUrl} colors={colors} motion={m} />
    </div>
  )
}

function Seconds({ control, name, label, hint, error }: { control: Control<PartnerForm>; name: 'heroMotion.enterMs' | 'heroMotion.exitMs' | 'heroMotion.delayMs'; label: string; hint: string; error?: string }) {
  const id = 'hm-' + name.split('.')[1]
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller control={control} name={name} render={({ field }) => (
        <div className="flex items-center gap-2">
          <Input id={id} type="number" step={0.1} min={0} className="w-28" aria-invalid={!!error}
            value={Number.isFinite(field.value) ? +(field.value / 1000).toFixed(2) : ''}
            onChange={(e) => field.onChange(e.target.value === '' ? NaN : Math.round(Number(e.target.value) * 1000))} onBlur={field.onBlur} />
          <span className="text-sm text-muted-foreground">seconds</span>
        </div>
      )} />
      <p className={'text-xs ' + (error ? 'text-destructive' : 'text-muted-foreground')}>{error || hint}</p>
    </div>
  )
}

/** Plays the switch: a stand-in "previous partner" leaves, this partner's picture arrives — same keyframes as the site.
    Replays by itself whenever a setting changes; "Loop" keeps replaying (alternating sides) while you tune. */
function Preview({ heroUrl, colors, motion }: { heroUrl: string | null; colors: Colors; motion: ReturnType<typeof heroMotionOf> }) {
  const { stage, oldEl, newEl, from, play, loop, setLoop } = useHeroSwitch(motion, heroUrl)
  return (
    <div className="grid max-w-[560px] gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Preview: switching to this partner (replays when you change a setting)</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant={from === -1 ? 'secondary' : 'outline'} size="sm" onClick={() => play(-1)} aria-label="Play, partner on the left"><ArrowLeft />From left</Button>
          <Button type="button" variant={from === 1 ? 'secondary' : 'outline'} size="sm" onClick={() => play(1)} aria-label="Play, partner on the right">From right<ArrowRight /></Button>
          <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Switch checked={loop} onCheckedChange={setLoop} aria-label="Loop the preview" />Loop</label>
        </div>
      </div>
      <div ref={stage} className="relative aspect-[16/9] w-full overflow-hidden rounded-lg" style={{ background: `radial-gradient(70% 60% at 50% 30%, ${colors.navy2}, ${colors.night})` }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center font-[Anton,Impact,sans-serif] uppercase leading-[.86] text-white" style={{ fontSize: 'clamp(20px,2.4vw,40px)' }}>
          <span>Every sport.</span>
          <span style={{ color: colors.cta }}>One code.</span>
        </div>
        <Persons oldEl={oldEl} newEl={newEl} heroUrl={heroUrl} />
        <div className="absolute left-1/2 top-1/2 h-[62%] w-[17%] -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] rounded-[14%] border-4 shadow-2xl" style={{ borderColor: colors.navy2, background: colors.panel }} />
        <div className="absolute bottom-[5%] right-[3%] h-[7%] w-[20%] rounded-md" style={{ background: colors.cta }} />
        <button type="button" onClick={() => play()} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/45 text-white hover:bg-black/60" aria-label="Replay"><Play className="size-3.5" /></button>
      </div>
      <p className="text-xs text-muted-foreground">
        Defaults: Slide · 1.6 s arrival · 0.9 s leaving · 0.18 s delay · {HERO_MOTION_DEFAULT.distance} px · Soft. Visitors who ask their device for less motion always get a short crossfade.
      </p>
    </div>
  )
}

/** The previous partner's person (a stand-in silhouette) and this partner's picture, stacked where the site puts them. */
export function Persons({ oldEl, newEl, heroUrl, small }: { oldEl: React.RefObject<HTMLDivElement | null>; newEl: React.RefObject<HTMLDivElement | null>; heroUrl: string | null; small?: boolean }) {
  return (
    <>
      <div ref={oldEl} className="absolute bottom-0 left-[2%] h-[86%] w-[22%] opacity-0 [mask-image:linear-gradient(to_top,transparent_0,#000_26%)]" aria-hidden="true">
        <div className="mx-auto mt-[4%] aspect-square w-[46%] rounded-full bg-white/35" />
        <div className="mx-auto mt-[4%] h-full w-[86%] rounded-t-[40%] bg-white/35" />
      </div>
      <div ref={newEl} className="absolute bottom-0 left-[2%] h-[86%] max-w-[44%]" aria-hidden="true">
        {heroUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={heroUrl} alt="" className="h-full w-auto object-contain object-left-bottom [mask-image:linear-gradient(to_top,transparent_0,#000_26%)]" />
          : <span className={'absolute bottom-[18%] left-[4%] whitespace-nowrap rounded bg-black/40 px-2 py-1 text-white ' + (small ? 'text-[9px]' : 'text-xs')}>No picture</span>}
      </div>
    </>
  )
}
