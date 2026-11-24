'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { AlertTriangle, Check, Download, Languages as LanguagesIcon, Loader2, Plus, Upload, Star } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { DataTable, type Col } from '@/backoffice/components/data-table'
import { EmptyState } from '@/backoffice/components/empty-state'
import { Button } from '@/backoffice/components/ui/button'
import { Badge } from '@/backoffice/components/ui/badge'
import { Progress } from '@/backoffice/components/ui/progress'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { Switch } from '@/backoffice/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/backoffice/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/backoffice/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/backoffice/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/backoffice/components/ui/sheet'
import { addLanguage, importTranslations, saveTranslation, setLanguageIcon, updateLanguage } from '@/backoffice/actions/translations'

export type TLang = { id: string; code: string; name: string; nativeName: string; dir: 'ltr' | 'rtl'; enabled: boolean; isDefault: boolean; iconUrl?: string | null }

/** The language's icon, or its code in a circle when it has none. */
function LangIcon({ url, code, size = 28 }: { url?: string | null; code: string; size?: number }) {
  return url
    ? <img src={url} alt="" className="shrink-0 rounded-full border object-cover" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-full border bg-muted font-mono text-[10px] uppercase text-muted-foreground" style={{ width: size, height: size }}>{code.slice(0, 2)}</span>
}
const ICON_ACCEPT = 'image/svg+xml,image/png,image/jpeg,image/webp'
export type TRow = { id: string; key: string; namespace: string; context: string; values: Record<string, string> }

const tokens = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(' ')

export function TranslationsView({ languages, rows }: { languages: TLang[]; rows: TRow[] }) {
  const router = useRouter()
  const source = languages.find((l) => l.isDefault) || languages[0]
  const [ns, setNs] = useState('all')
  const [show, setShow] = useState('all')
  const [langsOpen, setLangsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // keep edits locally so progress and filters update without a reload
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(rows.map((r) => [r.id, r.values])))

  const namespaces = useMemo(() => [...new Set(rows.map((r) => r.namespace))].sort(), [rows])
  const data = useMemo(() => rows
    .map((r) => ({ ...r, values: values[r.id] || {} }))
    .filter((r) => ns === 'all' || r.namespace === ns)
    .filter((r) => (show === 'all' ? true : !(r.values[show] || '').trim())), [rows, values, ns, show])

  const progress = languages.map((l) => {
    const done = rows.filter((r) => (values[r.id]?.[l.code] || '').trim()).length
    return { ...l, done, pct: rows.length ? Math.round((done / rows.length) * 100) : 0 }
  })

  const columns: Col<TRow>[] = useMemo(() => [
    {
      id: 'key', header: 'Text', size: 260, accessorFn: (r) => r.key + ' ' + Object.values(r.values).join(' '),
      cell: ({ row: { original: r } }) => (
        <div className="flex max-w-64 flex-col gap-1">
          <code className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{r.key}</code>
          {r.context && <span className="text-xs text-muted-foreground">{r.context}</span>}
        </div>
      ),
    },
    ...languages.map((l): Col<TRow> => ({
      id: 'lang_' + l.code, header: () => <span className="inline-flex items-center gap-1.5"><LangIcon url={l.iconUrl} code={l.code} size={16} />{l.nativeName}<Badge variant="outline" className="font-mono text-[10px]">{l.code}</Badge>{l.isDefault && <Star className="size-3 fill-current text-warning" aria-label="Default language" />}</span>,
      enableSorting: false, size: 320, accessorFn: (r) => r.values[l.code] || '',
      cell: ({ row: { original: r } }) => (
        <TCell key={r.id + l.code} rowId={r.id} lang={l} value={r.values[l.code] || ''} source={source && l.code !== source.code ? r.values[source.code] || '' : ''}
          onSaved={(v) => setValues((s) => ({ ...s, [r.id]: { ...s[r.id], [l.code]: v } }))} />
      ),
    })),
  ], [languages, source])

  function exportCsv() {
    const csv = Papa.unparse({ fields: ['key', 'context', ...languages.map((l) => l.code)], data: rows.map((r) => [r.key, r.context, ...languages.map((l) => values[r.id]?.[l.code] || '')]) })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `oddsclub-translations-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <PageHeader title="Translations" description="Every text on the site, side by side in each language. Changes are saved when you leave a field and show on the site right away.">
        <Button variant="outline" onClick={() => setImportOpen(true)}><Upload />Import</Button>
        <Button variant="outline" onClick={exportCsv}><Download />Export</Button>
        <Button variant="outline" onClick={() => setLangsOpen(true)}><LanguagesIcon />Languages</Button>
        <Button onClick={() => setAddOpen(true)}><Plus />Add language</Button>
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {progress.map((l) => (
          <button key={l.code} type="button" onClick={() => setShow(l.pct < 100 ? l.code : 'all')} className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{l.nativeName}</span>
              <span className="flex gap-1">
                {l.isDefault && <Badge variant="secondary">Default</Badge>}
                {!l.enabled && <Badge variant="outline">Hidden</Badge>}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3"><Progress value={l.pct} className="h-2" /><span className="w-10 text-right text-sm tabular-nums">{l.pct}%</span></div>
            <p className="mt-2 text-xs text-muted-foreground">{l.done} of {rows.length} texts{l.pct < 100 ? ' · click to see what’s missing' : ''}</p>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns} data={data} pageSize={25} searchPlaceholder="Search texts or keys"
        toolbar={
          <>
            <Select value={ns} onValueChange={setNs}>
              <SelectTrigger className="w-44" aria-label="Section"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All sections</SelectItem>{namespaces.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={show} onValueChange={setShow}>
              <SelectTrigger className="w-52" aria-label="Show"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All texts</SelectItem>{languages.map((l) => <SelectItem key={l.code} value={l.code}>Missing in {l.nativeName}</SelectItem>)}</SelectContent>
            </Select>
          </>
        }
        empty={<EmptyState icon={Check} title={show === 'all' ? 'No texts match' : 'Nothing missing'}>{show === 'all' ? 'Try another search or section.' : 'Every text in this view is translated.'}</EmptyState>}
      />

      <LanguagesSheet open={langsOpen} onOpenChange={setLangsOpen} languages={languages} onChanged={() => router.refresh()} />
      <AddLanguageDialog open={addOpen} onOpenChange={setAddOpen} onDone={() => router.refresh()} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} languages={languages} onDone={() => router.refresh()} />
    </>
  )
}

function TCell({ rowId, lang, value, source, onSaved }: { rowId: string; lang: TLang; value: string; source: string; onSaved: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saved = useRef(value)
  const missingTokens = source && v.trim() && tokens(source) !== tokens(v)
  async function save() {
    if (v === saved.current) return
    setState('saving')
    const r = await saveTranslation(rowId, lang.code, v)
    if (r.ok) { saved.current = v; onSaved(v); setState('saved'); setTimeout(() => setState('idle'), 1500) }
    else { setState('idle'); toast.error(r.error) }
  }
  return (
    <div className="relative">
      <textarea
        dir={lang.dir} value={v} onChange={(e) => setV(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur() }}
        placeholder={source ? 'Not translated yet' : '—'} aria-label={`${lang.name} text`}
        className={'field-sizing-content min-h-9 w-full min-w-56 resize-none rounded-md border bg-transparent px-2.5 py-1.5 pr-7 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ' + (!v.trim() ? 'border-dashed bg-muted/30' : 'border-input')}
      />
      <span className="absolute right-2 top-2">
        {state === 'saving' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {state === 'saved' && <Check className="size-3.5 text-success" />}
        {state === 'idle' && missingTokens && (
          <Tooltip><TooltipTrigger asChild><AlertTriangle className="size-3.5 text-warning" aria-label="Placeholders differ" /></TooltipTrigger>
            <TooltipContent>Keep the same placeholders as the default language: {tokens(source) || 'none'}</TooltipContent></Tooltip>
        )}
      </span>
    </div>
  )
}

function LanguagesSheet({ open, onOpenChange, languages, onChanged }: { open: boolean; onOpenChange: (o: boolean) => void; languages: TLang[]; onChanged: () => void }) {
  const [pending, start] = useTransition()
  function upd(id: string, data: { enabled?: boolean; isDefault?: boolean }, msg: string) {
    start(async () => { const r = await updateLanguage(id, data); if (r.ok) { toast.success(msg); onChanged() } else toast.error(r.error) })
  }
  function icon(l: TLang, file: File | null) {
    const fd = new FormData(); if (file) fd.set('icon', file)
    start(async () => { const r = await setLanguageIcon(l.id, file ? fd : null); if (r.ok) { toast.success(file ? `Icon for ${l.nativeName} saved` : `Icon for ${l.nativeName} removed`); onChanged() } else toast.error(r.error) })
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Languages</SheetTitle>
          <SheetDescription>Shown languages appear in the site’s language switcher, with their icon. Click an icon to change it (SVG, PNG or JPG, e.g. a flag). Texts missing in a language fall back to the default language.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col divide-y px-4">
          {languages.map((l) => (
            <div key={l.id} className="flex items-center gap-3 py-3">
              <label className="group relative cursor-pointer" title={l.iconUrl ? 'Change the icon' : 'Add an icon'}>
                <LangIcon url={l.iconUrl} code={l.code} size={36} />
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{l.iconUrl ? 'Change' : 'Add'}</span>
                <input type="file" accept={ICON_ACCEPT} className="sr-only" aria-label={`Icon for ${l.nativeName}`} disabled={pending} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) icon(l, f) }} />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">{l.nativeName}<Badge variant="outline" className="font-mono text-[10px]">{l.code}</Badge>{l.dir === 'rtl' && <Badge variant="outline">RTL</Badge>}</div>
                <div className="text-xs text-muted-foreground">{l.name}{l.isDefault ? ' · default' : ''}{l.iconUrl && <> · <button type="button" className="underline-offset-2 hover:underline" disabled={pending} onClick={() => icon(l, null)}>remove icon</button></>}</div>
              </div>
              {!l.isDefault && <Button variant="ghost" size="sm" disabled={pending} onClick={() => upd(l.id, { isDefault: true }, `${l.nativeName} is now the default`)}>Make default</Button>}
              <div className="flex items-center gap-2">
                <Label htmlFor={'en-' + l.id} className="text-xs text-muted-foreground">Shown</Label>
                <Switch id={'en-' + l.id} checked={l.enabled} disabled={pending || l.isDefault} onCheckedChange={(c) => upd(l.id, { enabled: c }, c ? `${l.nativeName} is shown on the site` : `${l.nativeName} is hidden`)} />
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AddLanguageDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [f, setF] = useState({ code: '', name: '', nativeName: '', dir: 'ltr' as 'ltr' | 'rtl' })
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  function pickIcon(file: File | undefined) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('That icon is over 2 MB.'); return }
    if (iconPreview) URL.revokeObjectURL(iconPreview)
    setIconFile(file); setIconPreview(URL.createObjectURL(file))
  }
  function submit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await addLanguage(f)
      if (!r.ok) { toast.error(r.error); return }
      if (iconFile && r.data) {
        const fd = new FormData(); fd.set('icon', iconFile)
        const ri = await setLanguageIcon(r.data, fd)
        if (!ri.ok) toast.error(`${f.nativeName} was added, but the icon wasn’t: ${ri.error}`)
      }
      toast.success(`${f.nativeName} added. Translate its texts, then switch it on in Languages.`)
      setF({ code: '', name: '', nativeName: '', dir: 'ltr' }); setIconFile(null); setIconPreview(null); onOpenChange(false); onDone()
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a language</DialogTitle>
            <DialogDescription>It starts hidden so visitors don’t see half-translated pages. Switch it on when it’s ready.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2"><Label htmlFor="lc">Code</Label><Input id="lc" placeholder="sw" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
            <div className="col-span-2 grid gap-2"><Label htmlFor="ln">Name in English</Label><Input id="ln" placeholder="Swahili" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 grid gap-2"><Label htmlFor="lnn">Name in the language</Label><Input id="lnn" placeholder="Kiswahili" required value={f.nativeName} onChange={(e) => setF({ ...f, nativeName: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Direction</Label>
              <Select value={f.dir} onValueChange={(v) => setF({ ...f, dir: v as 'ltr' | 'rtl' })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ltr">Left to right</SelectItem><SelectItem value="rtl">Right to left</SelectItem></SelectContent></Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Icon <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <div className="flex items-center gap-3">
              <LangIcon url={iconPreview} code={f.code || '?'} size={40} />
              <label className="cursor-pointer">
                <span className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">{iconFile ? 'Change icon' : 'Choose an icon'}</span>
                <input type="file" accept={ICON_ACCEPT} className="sr-only" onChange={(e) => { pickIcon(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {iconFile && <Button type="button" variant="ghost" size="sm" onClick={() => { if (iconPreview) URL.revokeObjectURL(iconPreview); setIconFile(null); setIconPreview(null) }}>Remove</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Shown in the site’s language switcher, e.g. a flag. SVG, PNG or JPG, up to 2 MB.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Add language</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ open, onOpenChange, languages, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; languages: TLang[]; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [parsed, setParsed] = useState<{ key: string; values: Record<string, string> }[] | null>(null)
  const [cols, setCols] = useState<string[]>([])
  function onFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const codes = (res.meta.fields || []).filter((f) => languages.some((l) => l.code === f))
        if (!res.meta.fields?.includes('key') || !codes.length) { toast.error('The file needs a “key” column and at least one language column (e.g. en, fr).'); return }
        setCols(codes)
        setParsed(res.data.filter((r) => r.key).map((r) => ({ key: r.key.trim(), values: Object.fromEntries(codes.map((c) => [c, (r[c] || '').trim()])) })))
      },
      error: () => toast.error('Could not read that file'),
    })
  }
  function submit() {
    if (!parsed) return
    start(async () => {
      const r = await importTranslations(parsed)
      if (r.ok) { toast.success(`${r.data?.updated ?? 0} texts updated${r.data?.skipped ? `, ${r.data.skipped} unknown keys skipped` : ''}`); setParsed(null); onOpenChange(false); onDone() }
      else toast.error(r.error)
    })
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setParsed(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import translations</DialogTitle>
          <DialogDescription>Upload a CSV with a “key” column and one column per language code. Use Export to get a ready-made file. Empty cells are left unchanged.</DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {parsed && <p className="rounded-md bg-muted px-3 py-2 text-sm">{parsed.length} rows found · languages: {cols.join(', ')}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!parsed || pending}>{pending && <Loader2 className="animate-spin" />}Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
