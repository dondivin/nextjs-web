'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { toast } from 'sonner'
import { formatDistanceToNowStrict } from 'date-fns'
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Loader2, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { Switch } from '@/backoffice/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/backoffice/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/backoffice/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/backoffice/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { COLOR_FIELDS, contrast, partnerSchema, type ColorKey, type PartnerForm } from '@/backoffice/lib/partner-schema'
import { deletePartner, savePartner } from '@/backoffice/actions/partners'
import { PartnerPreview } from './partner-preview'

export function PartnerEditor({ id, initial, languages, canDelete, updatedAt }: { id: string; initial: PartnerForm; languages: { code: string; name: string }[]; canDelete: boolean; updatedAt: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const form = useForm<PartnerForm>({ resolver: zodResolver(partnerSchema), defaultValues: initial, mode: 'onBlur' })
  const { register, control, handleSubmit, formState, reset } = form
  const v = useWatch({ control }) as PartnerForm
  const colors = v.colors || initial.colors
  const firstText = v.texts?.find((t) => t.bonus) || v.texts?.[0]
  const btnContrast = contrast(colors.cta, colors.ink)
  const oddsContrast = contrast(colors.oddBg, colors.odds)

  function onSubmit(data: PartnerForm) {
    start(async () => {
      const r = await savePartner(id, data)
      if (r.ok) { toast.success('Saved. The site uses the new values now.'); reset(data); router.refresh() } else toast.error(r.error)
    })
  }
  function onDelete() {
    start(async () => {
      const r = await deletePartner(id)
      if (r.ok) { toast.success(`${initial.name} deleted`); router.push('/admin/partners') } else toast.error(r.error)
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error('Some fields need fixing'))} noValidate>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/admin/partners" aria-label="Back to partners"><ArrowLeft /></Link></Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{v.name || 'Partner'}</h1>
            <p className="text-sm text-muted-foreground">{formState.isDirty ? 'Unsaved changes' : `Saved ${formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true })}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" asChild><a href={`/#b-${initial.slug}`} target="_blank" rel="noopener"><ExternalLink />View on site</a></Button>
          {formState.isDirty && <Button type="button" variant="outline" onClick={() => reset(initial)}><RotateCcw />Discard</Button>}
          <Button type="submit" disabled={pending || !formState.isDirty}>{pending ? <Loader2 className="animate-spin" /> : <Check />}Save changes</Button>
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="More"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}><Trash2 />Delete partner</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle><CardDescription>How the partner appears in the switcher and in links.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={formState.errors.name?.message}><Input {...register('name')} /></Field>
              <Field label="Link id" hint={`Used in links: /#b-${v.slug || 'id'}`} error={formState.errors.slug?.message}><Input className="font-mono" {...register('slug')} /></Field>
              <Field label="Position" hint="Lower numbers come first"><Input type="number" {...register('order', { valueAsNumber: true })} /></Field>
              <div className="flex items-end">
                <Controller control={control} name="active" render={({ field }) => (
                  <label className="flex h-9 items-center gap-3 rounded-md border px-3 text-sm"><Switch checked={field.value} onCheckedChange={field.onChange} />{field.value ? 'Live on the site' : 'Hidden from visitors'}</label>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Offer</CardTitle><CardDescription>The promo code and links visitors use to sign up.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Promo code" className="sm:col-span-2"><Input className="font-mono uppercase" {...register('promoCode')} /></Field>
              <Field label="Sign-up link" hint="Your affiliate link" error={formState.errors.signupUrl?.message}><Input placeholder="https://" {...register('signupUrl')} /></Field>
              <Field label="Bonus terms link" hint="Optional" error={formState.errors.termsUrl?.message}><Input placeholder="https://" {...register('termsUrl')} /></Field>
              <div className="sm:col-span-2">
                <div className="overflow-hidden rounded-md border">
                  <div className="grid grid-cols-[110px_1fr_1fr] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"><span>Language</span><span>Welcome bonus</span><span>Payment methods</span></div>
                  {languages.map((l, i) => (
                    <div key={l.code} className="grid grid-cols-[110px_1fr_1fr] items-center gap-3 border-b px-3 py-2 last:border-0">
                      <span className="text-sm">{l.name}</span>
                      <Input placeholder="e.g. 100% up to €130" {...register(`texts.${i}.bonus` as const)} />
                      <Input placeholder="e.g. Mobile money, cards" {...register(`texts.${i}.payments` as const)} />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Theme colours</CardTitle>
              <CardDescription>Copy them from the partner’s own site. The preview updates as you pick.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map((f) => (
                <Controller key={f.key} control={control} name={`colors.${f.key}` as const} render={({ field, fieldState }) => (
                  <ColorField label={f.label} hint={f.hint} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
                )} />
              ))}
              {(btnContrast < 4.5 || oddsContrast < 4.5) && (
                <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm sm:col-span-2" role="status">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div>
                    {btnContrast < 4.5 && <p>Button text is hard to read on the primary colour (contrast {btnContrast.toFixed(1)}:1, aim for 4.5:1).</p>}
                    {oddsContrast < 4.5 && <p>Odds numbers are hard to read on their background (contrast {oddsContrast.toFixed(1)}:1).</p>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <p className="mb-2 text-sm font-medium">Live preview</p>
          <PartnerPreview c={colors as Record<ColorKey, string>} name={v.name} promo={v.promoCode} bonus={firstText?.bonus || ''} />
          <p className="mt-2 text-xs text-muted-foreground">A simplified view of the hero, the 3D phone screen, the odds board and the footer.</p>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {initial.name}?</AlertDialogTitle>
            <AlertDialogDescription>The partner and its theme are removed from the site permanently. To take it offline for now, switch it to Hidden instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onDelete}>Delete partner</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={'grid gap-1.5 ' + (className || '')}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ColorField({ label, hint, value, onChange, error }: { label: string; hint: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="size-9 shrink-0 rounded-md border shadow-xs ring-offset-background focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" style={{ background: value }} aria-label={`Pick ${label}`} />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <HexColorPicker color={value} onChange={(c) => onChange(c.toUpperCase())} />
          <HexColorInput color={value} onChange={(c) => onChange(c.toUpperCase())} prefixed className="mt-3 h-8 w-full rounded-md border bg-transparent px-2 font-mono text-sm uppercase" />
        </PopoverContent>
      </Popover>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className={'truncate text-xs ' + (error ? 'text-destructive' : 'text-muted-foreground')}>{error || hint}</div>
      </div>
      <HexColorInput color={value} onChange={(c) => onChange(c.toUpperCase())} prefixed aria-label={label + ' hex'} className="h-8 w-24 rounded-md border bg-transparent px-2 font-mono text-xs uppercase" />
    </div>
  )
}
