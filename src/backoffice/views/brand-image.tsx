'use client'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ImageUp, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/backoffice/components/ui/button'
import { Label } from '@/backoffice/components/ui/label'
import { setBrandImage } from '@/backoffice/actions/content'
import type { ActionResult } from '@/backoffice/lib/server'

export function LogoMark({ url, size }: { url: string | null; size: number }) {
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

/** Upload / replace / remove one brand image; saved immediately (not part of a form). `save` overrides where it goes (e.g. a partner). */
export function BrandImage({ kind, label, hint, url, fallback, wide, onDone, save }: { kind: 'logo' | 'share' | 'hero' | 'icon'; label: string; hint: string; url: string | null; fallback?: string; wide?: boolean; onDone: () => void; save?: (fd: FormData | null) => Promise<ActionResult<{ transparent?: boolean }>> }) {
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  function upload(file: File | null) {
    const max = kind === 'hero' ? 10 : 5
    if (file && file.size > max * 1024 * 1024) { toast.error(`That image is over ${max} MB.`); return }
    const fd = new FormData()
    if (file) { fd.set('file', file); setPreview(URL.createObjectURL(file)) }
    start(async () => {
      const r = save ? await save(file ? fd : null) : await setBrandImage(kind, file ? fd : null)
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
            ? <img src={shown} alt="" className={'size-full ' + (wide ? 'object-cover' : 'object-contain p-1.5') + (!preview && !url && fallback ? ' opacity-40' : '')} />
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
