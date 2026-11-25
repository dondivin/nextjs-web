'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/backoffice/components/ui/button'
import { Checkbox } from '@/backoffice/components/ui/checkbox'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/backoffice/components/ui/alert-dialog'
import { deleteMemberAccount, setTemporaryPassword } from '@/backoffice/actions/members'

export type MemberRef = { id: string; name: string; email: string; messages?: number }

/** Asks, then gives the member a new temporary password and shows it once (to copy and send them). */
export function TempPasswordDialog({ member, onClose }: { member: MemberRef | null; onClose: () => void }) {
  const [pending, start] = useTransition()
  const [password, setPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const close = () => { setPassword(null); setCopied(false); onClose() }
  return (
    <AlertDialog open={!!member} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{password ? 'New password' : `Reset ${member?.name}’s password?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {password
              ? `Send it to ${member?.name} (${member?.email}) privately. It is shown only now. Their old password no longer works.`
              : 'A new temporary password is created and their old one stops working. Use it when a member asks you for help signing in.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {password && (
          <div className="flex items-center gap-2">
            <Input readOnly value={password} className="font-mono text-base" aria-label="Temporary password" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(password).then(() => { setCopied(true); toast.success('Copied') }) }}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}</Button>
          </div>
        )}
        <AlertDialogFooter>
          {password ? <Button onClick={close}>Done</Button> : (
            <>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button disabled={pending} onClick={() => member && start(async () => { const r = await setTemporaryPassword(member.id); if (r.ok && r.data) setPassword(r.data); else if (!r.ok) toast.error(r.error) })}>
                {pending && <Loader2 className="animate-spin" />}Create new password
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Delete an account for good; optionally its messages too (otherwise they stay, signed "Deleted account"). */
export function DeleteMemberDialog({ member, onClose, onDeleted }: { member: MemberRef | null; onClose: () => void; onDeleted: () => void }) {
  const [pending, start] = useTransition()
  const [withMessages, setWithMessages] = useState(false)
  const [typed, setTyped] = useState('')
  const close = () => { setWithMessages(false); setTyped(''); onClose() }
  return (
    <AlertDialog open={!!member} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {member?.name}’s account?</AlertDialogTitle>
          <AlertDialogDescription>
            This can’t be undone. They are signed out, leave every group and private chat, and their username becomes free. Rooms they made become team rooms.
            To stop them posting but keep the account, ban them instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={withMessages} onCheckedChange={(v) => setWithMessages(v === true)} className="mt-0.5" />
          <span>Also delete their {member?.messages ?? ''} message{member?.messages === 1 ? '' : 's'}<span className="block text-xs text-muted-foreground">Otherwise they stay in the chat, signed “Deleted account”.</span></span>
        </label>
        <div className="grid gap-1.5">
          <Label htmlFor="del-confirm" className="text-xs text-muted-foreground">Type <b className="text-foreground">{member?.name}</b> to confirm</Label>
          <Input id="del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={pending || typed.trim().toLowerCase() !== (member?.name || '').toLowerCase()}
            onClick={(e) => { e.preventDefault(); if (member) start(async () => { const r = await deleteMemberAccount(member.id, withMessages); if (r.ok) { toast.success(`${member.name}’s account was deleted`); close(); onDeleted() } else toast.error(r.error) }) }}>
            {pending && <Loader2 className="animate-spin" />}Delete account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
