'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { PasswordInput } from '@/backoffice/components/ui/password-input'
import { Label } from '@/backoffice/components/ui/label'
import { Textarea } from '@/backoffice/components/ui/textarea'
import { completeStaffReset, requestStaffReset, staffResetStatus } from '@/backoffice/actions/staff-reset'

/*
 * Back-office "Forgot your password?". States: request → waiting (an owner must approve) → choose a new password → signed in.
 * The request id + secret stay in this browser (localStorage), so only the person who asked can finish it.
 */
type Saved = { id: string; token: string; email: string }
type View = 'request' | 'pending' | 'approved' | 'denied' | 'expired'
const KEY = 'oc_staff_reset'
const read = (): Saved | null => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.id && v.token ? v : null } catch { return null } }
const save = (v: Saved | null) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY) } catch {} }

export function ForgotForm() {
  const router = useRouter()
  const [view, setView] = useState<View | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(async (s: Saved | null) => {
    if (!s) { setView('request'); return }
    const r = await staffResetStatus(s.id, s.token)
    const st = r.ok ? r.data : 'expired'
    if (st === 'done') { save(null); setSaved(null); setView('request'); return }
    setView((st as View) || 'request')
  }, [])

  useEffect(() => { const s = read(); setSaved(s); if (s) setEmail(s.email); check(s) }, [check])
  // while waiting, look again every 20 s
  useEffect(() => {
    if (view !== 'pending' || !saved) return
    const t = setInterval(() => check(saved), 20000)
    return () => clearInterval(t)
  }, [view, saved, check])

  async function send(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true)
    const r = await requestStaffReset(email, note)
    setBusy(false)
    if (!r.ok || !r.data) { setError(r.ok ? 'Something went wrong. Try again.' : r.error); return }
    save(r.data); setSaved(r.data); setNote(''); setView('pending')
  }
  async function finish(e: React.FormEvent) {
    e.preventDefault(); if (!saved) return
    setError(null); setBusy(true)
    const r = await completeStaffReset(saved.id, saved.token, password)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    save(null)
    router.replace('/admin'); router.refresh()
  }
  function startOver() { save(null); setSaved(null); setError(null); setView('request') }

  if (!view) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>

  const back = <a href="/admin/login" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Back to sign in</a>
  const err = error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>

  if (view === 'request') return (
    <form onSubmit={send} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">There’s no reset email. Your request goes to the owners: once one of them approves it, you choose a new password here, in this browser.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Your account email</Label>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="note">Message to the owners (optional)</Label>
        <Textarea id="note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="So they know it’s really you" />
      </div>
      {err}
      <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="animate-spin" />}Send request</Button>
      {back}
    </form>
  )

  if (view === 'approved') return (
    <form onSubmit={finish} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1">
        <CheckCircle2 className="size-8 text-success" />
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">An owner approved the reset for {saved?.email}. You’ll be signed in right after.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput id="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      {err}
      <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="animate-spin" />}Save and sign in</Button>
    </form>
  )

  const isPending = view === 'pending'
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {isPending ? <Clock className="size-8 text-muted-foreground" /> : <XCircle className="size-8 text-destructive" />}
        <h1 className="text-2xl font-semibold tracking-tight">{isPending ? 'Waiting for an owner' : view === 'denied' ? 'Request declined' : 'Request expired'}</h1>
        <p className="text-sm text-muted-foreground">
          {isPending
            ? `Your request for ${saved?.email} is on the owners’ Password resets page. Keep this page or come back to it in this browser — it updates by itself once it’s approved.`
            : view === 'denied' ? 'An owner declined this request. Contact them directly, or send a new request with more details.' : 'This request is no longer valid. Send a new one if you still need it.'}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {isPending
          ? <><Button onClick={() => check(saved)} className="w-full">Check again</Button><Button variant="outline" onClick={startOver} className="w-full">Cancel request</Button></>
          : <Button onClick={startOver} className="w-full">Send a new request</Button>}
      </div>
      {back}
    </div>
  )
}
