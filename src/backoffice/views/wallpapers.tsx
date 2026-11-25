'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Grid3x3, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Switch } from '@/backoffice/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/backoffice/components/ui/toggle-group'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { deleteWallpaper, moveWallpaper, updateWallpaper, uploadWallpaper } from '@/backoffice/actions/wallpapers'

type Mode = 'cover' | 'tile'
export type WallpaperRow = { id: string; name: string; active: boolean; mode: Mode; dim: number; url: string }

/** Shrink in the browser before upload (photo ≤ 2400 px, pattern ≤ 800 px), so a big picture never hits the upload limit. */
async function shrink(file: File, mode: Mode): Promise<File> {
  const MAX = mode === 'tile' ? 800 : 2400
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url })
    URL.revokeObjectURL(url)
    const w0 = img.naturalWidth || MAX, h0 = img.naturalHeight || MAX, k = Math.min(1, MAX / Math.max(w0, h0))
    if (k === 1 && file.size < 3 * 1024 * 1024 && file.type !== 'image/svg+xml') return file
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', 0.9))
    return blob ? new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.webp', { type: 'image/webp' }) : file
  } catch { return file }
}

/** How it looks behind messages (navy = the default chat theme's background, used for the darkening). */
function Preview({ url, mode, dim }: { url: string; mode: Mode; dim: number }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#0D2747]"
      style={{ backgroundImage: `linear-gradient(rgba(13,39,71,${dim / 100}),rgba(13,39,71,${dim / 100})),url("${url}")`, backgroundSize: mode === 'tile' ? 'auto, 180px' : 'auto, cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-1.5 text-[11px] font-medium">
        <span className="w-fit rounded-xl rounded-bl-sm bg-[#16365F] px-2.5 py-1 text-white shadow">Big match tonight!</span>
        <span className="w-fit self-end rounded-xl rounded-br-sm bg-[#2E6BE6] px-2.5 py-1 text-white shadow">Home win, easy 🔥</span>
      </div>
    </div>
  )
}

/** Chat wallpapers: members and visitors pick one in the chat (theme sheet → Wallpaper), in this order. */
export function WallpapersView({ rows }: { rows: WallpaperRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [uploading, startUpload] = useTransition()
  const [confirm, setConfirm] = useState<WallpaperRow | null>(null)
  const [dims, setDims] = useState<Record<string, number>>({})
  const photo = useRef<HTMLInputElement>(null), pattern = useRef<HTMLInputElement>(null)
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { const r = await fn(); if (r.ok) { if (ok) toast.success(ok); router.refresh() } else toast.error(r.error) })
  function upload(files: FileList | null, mode: Mode) {
    if (!files || !files.length) return
    const list = Array.from(files).slice(0, 20)
    startUpload(async () => {
      let added = 0
      const failed: string[] = []
      const tid = list.length > 1 ? toast.loading(`Uploading 0 / ${list.length}…`) : undefined
      for (let i = 0; i < list.length; i++) {
        try {
          const fd = new FormData(); fd.append('file', await shrink(list[i], mode)); fd.append('mode', mode)
          const r = await uploadWallpaper(fd)
          if (r.ok) added++; else failed.push(list[i].name)
        } catch { failed.push(list[i].name) }
        if (tid !== undefined) toast.loading(`Uploading ${i + 1} / ${list.length}…`, { id: tid })
      }
      if (tid !== undefined) toast.dismiss(tid)
      if (added) toast.success(`${added} wallpaper${added === 1 ? '' : 's'} added`)
      if (failed.length) toast.error(`Couldn’t use: ${failed.join(', ')}`)
      router.refresh()
    })
  }
  return (
    <>
      <PageHeader title="Wallpapers" description="Backgrounds people can choose for the chat (palette button → theme → bubbles → Wallpaper). “Theme default” and “Plain” are always offered; yours come after, in this order. Photos fill the background; patterns repeat. Darken keeps messages readable (it mixes in the chat theme’s background colour).">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => pattern.current?.click()} disabled={uploading}><Grid3x3 />Upload pattern</Button>
          <Button onClick={() => photo.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" /> : <Upload />}Upload photos</Button>
        </div>
      </PageHeader>
      <input ref={photo} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => { upload(e.target.files, 'cover'); e.target.value = '' }} />
      <input ref={pattern} type="file" hidden multiple accept="image/png,image/webp,image/svg+xml,image/jpeg" onChange={(e) => { upload(e.target.files, 'tile'); e.target.value = '' }} />
      {rows.length === 0 ? (
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files, 'cover') }}>
          <EmptyState icon={ImageIcon} title="No wallpapers yet">Upload stadium shots, club colours, a pattern with your logo… (or drop photos here). Until then people can pick “Theme default” or “Plain”.</EmptyState>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files, 'cover') }}>
          {rows.map((w, i) => {
            const dim = dims[w.id] ?? w.dim
            return (
              <li key={w.id} className={'grid gap-2 rounded-xl border bg-card p-3 ' + (w.active ? '' : 'opacity-60')}>
                <Preview url={w.url} mode={w.mode} dim={dim} />
                <Input defaultValue={w.name} aria-label="Wallpaper name" className="h-8 text-sm" onBlur={(e) => { if (e.target.value.trim() !== w.name) act(() => updateWallpaper(w.id, { name: e.target.value }), 'Renamed') }} />
                <div className="flex items-center justify-between gap-2">
                  <ToggleGroup type="single" size="sm" variant="outline" value={w.mode} onValueChange={(v) => { if (v && v !== w.mode) act(() => updateWallpaper(w.id, { mode: v as Mode })) }} aria-label="How it is shown">
                    <ToggleGroupItem value="cover" aria-label="Photo: fills the background"><ImageIcon />Photo</ToggleGroupItem>
                    <ToggleGroupItem value="tile" aria-label="Pattern: repeats"><Grid3x3 />Pattern</ToggleGroupItem>
                  </ToggleGroup>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={w.active} disabled={pending} onCheckedChange={(v) => act(() => updateWallpaper(w.id, { active: v }), v ? 'Offered in the chat' : 'Hidden from the chat')} />Shown</label>
                </div>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span className="flex justify-between"><span>Darken</span><span className="tabular-nums">{dim}%</span></span>
                  <input type="range" min={0} max={70} step={5} value={dim} className="accent-primary" aria-label="Darken"
                    onChange={(e) => setDims((d) => ({ ...d, [w.id]: Number(e.target.value) }))}
                    onPointerUp={() => { if (dim !== w.dim) act(() => updateWallpaper(w.id, { dim })) }}
                    onKeyUp={() => { if (dim !== w.dim) act(() => updateWallpaper(w.id, { dim })) }} />
                </label>
                <div className="flex justify-end">
                  <Button variant="ghost" size="icon-sm" aria-label="Move earlier" disabled={pending || i === 0} onClick={() => act(() => moveWallpaper(w.id, -1))}><ArrowLeft /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move later" disabled={pending || i === rows.length - 1} onClick={() => act(() => moveWallpaper(w.id, 1))}><ArrowRight /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Delete ${w.name}`} disabled={pending} onClick={() => setConfirm(w)}><Trash2 /></Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the wallpaper “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>It is no longer offered. People who had chosen it go back to their theme’s own background.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) act(() => deleteWallpaper(confirm.id), 'Wallpaper deleted'); setConfirm(null) }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
