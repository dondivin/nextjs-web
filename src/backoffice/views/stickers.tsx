'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Loader2, Smile, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Switch } from '@/backoffice/components/ui/switch'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { deleteSticker, moveSticker, updateSticker, uploadStickers } from '@/backoffice/actions/stickers'

export type StickerRow = { id: string; name: string; active: boolean; url: string }

/**
 * Draw the picture at most 1024 px wide / high (WebP, transparency kept) before sending it; the server then trims it and
 * makes every sticker the same 512 × 512 square. Falls back to the original file if the browser can't read it.
 */
async function shrinkForSticker(file: File): Promise<File> {
  const MAX = 1024
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url })
    URL.revokeObjectURL(url)
    const w0 = img.naturalWidth || 512, h0 = img.naturalHeight || 512, k = Math.min(1, MAX / Math.max(w0, h0))
    if (k === 1 && file.size < 1.5 * 1024 * 1024 && file.type !== 'image/svg+xml') return file
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', 0.92))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.webp', { type: 'image/webp' })
  } catch { return file }
}

/** Our own stickers: they appear first in the sticker tray of the chat's picture editor, in this order. */
export function StickersView({ rows }: { rows: StickerRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [uploading, startUpload] = useTransition()
  const [confirm, setConfirm] = useState<StickerRow | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { const r = await fn(); if (r.ok) { if (ok) toast.success(ok); router.refresh() } else toast.error(r.error) })
  function upload(files: FileList | null) {
    if (!files || !files.length) return
    const list = Array.from(files).slice(0, 30)
    // one picture per request, shrunk in the browser first: a big photo never hits the server's upload size limit
    startUpload(async () => {
      let added = 0
      const failed: string[] = []
      const tid = list.length > 1 ? toast.loading(`Uploading 0 / ${list.length}…`) : undefined
      for (let i = 0; i < list.length; i++) {
        const f = list[i]
        try {
          const fd = new FormData(); fd.append('files', await shrinkForSticker(f))
          const r = await uploadStickers(fd)
          if (!r.ok) failed.push(f.name)
          else { added += r.data?.added || 0; failed.push(...(r.data?.failed || [])) }
        } catch { failed.push(f.name) }
        if (tid !== undefined) toast.loading(`Uploading ${i + 1} / ${list.length}…`, { id: tid })
      }
      if (tid !== undefined) toast.dismiss(tid)
      if (added) toast.success(`${added} sticker${added === 1 ? '' : 's'} added`)
      if (failed.length) toast.error(`Couldn’t use: ${failed.join(', ')}`)
      router.refresh()
    })
  }
  return (
    <>
      <PageHeader title="Stickers" description="Team stickers: everyone can use them in the chat’s photo editor (section “Team stickers” of the tray). Members can also add their own pictures as personal stickers, which only they see. Every sticker gets the same size (a 512 × 512 square): empty margins are trimmed and the picture is centred. Best: PNG or WebP with a transparent background. Big pictures are shrunk before upload.">
        <Button onClick={() => input.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" /> : <Upload />}Upload stickers</Button>
      </PageHeader>
      <input ref={input} type="file" hidden multiple accept="image/png,image/webp,image/gif,image/jpeg,image/svg+xml" onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
      {rows.length === 0 ? (
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files) }}>
          <EmptyState icon={Smile} title="No stickers yet">Upload your logo, partner logos, a mascot… (or drop pictures here). Members can still use the emoji stickers and their own pictures.</EmptyState>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files) }}>
          {rows.map((s, i) => (
            <li key={s.id} className={'grid gap-2 rounded-xl border bg-card p-3 ' + (s.active ? '' : 'opacity-60')}>
              <div className="grid aspect-square place-items-center rounded-lg bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.url && <img src={s.url} alt="" className="max-h-full max-w-full object-contain" />}
              </div>
              <Input defaultValue={s.name} aria-label="Sticker name" className="h-8 text-sm" onBlur={(e) => { if (e.target.value.trim() !== s.name) act(() => updateSticker(s.id, { name: e.target.value }), 'Renamed') }} />
              <div className="flex items-center justify-between gap-1">
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={s.active} disabled={pending} onCheckedChange={(v) => act(() => updateSticker(s.id, { active: v }), v ? 'Shown in the tray' : 'Hidden from the tray')} />Shown</label>
                <div className="flex">
                  <Button variant="ghost" size="icon-sm" aria-label="Move earlier" disabled={pending || i === 0} onClick={() => act(() => moveSticker(s.id, -1))}><ArrowLeft /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move later" disabled={pending || i === rows.length - 1} onClick={() => act(() => moveSticker(s.id, 1))}><ArrowRight /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Delete ${s.name}`} disabled={pending} onClick={() => setConfirm(s)}><Trash2 /></Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the sticker “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>It leaves the sticker tray. Photos already sent with it keep it (it’s part of the picture).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) act(() => deleteSticker(confirm.id), 'Sticker deleted'); setConfirm(null) }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
