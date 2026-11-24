'use client'
import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/backoffice/components/ui/card'
import { Badge } from '@/backoffice/components/ui/badge'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { ROLE_OPTIONS, accountSchema, type AccountForm } from '@/backoffice/lib/forms'
import { saveMyAccount } from '@/backoffice/actions/team'

export function AccountView({
  name,
  email,
  roles,
  canChat,
}: {
  name: string
  email: string
  roles: string[]
  canChat: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const initial: AccountForm = { name, email, newPassword: '', currentPassword: '' }
  const { register, control, handleSubmit, formState, reset } = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: initial,
  })
  const v = useWatch({ control })
  const needsCurrent =
    (v.email || '').trim().toLowerCase() !== email.toLowerCase() || !!v.newPassword
  const e = formState.errors

  function onSubmit(d: AccountForm) {
    start(async () => {
      const r = await saveMyAccount(d)
      if (r.ok) {
        toast.success('Account saved')
        reset({ ...d, newPassword: '', currentPassword: '' })
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
      <PageHeader title="My account" description="Your back-office sign-in details.">
        <Button type="submit" disabled={pending || !formState.isDirty}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}Save changes
        </Button>
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your roles are set by an owner under Team accounts.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="a-name">Name</Label>
              <Input id="a-name" autoComplete="name" {...register('name')} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Roles:</span>
              {roles.map((r) => (
                <Badge key={r} variant={r === 'owner' ? 'default' : 'secondary'}>
                  {ROLE_OPTIONS.find((o) => o.value === r)?.label || r}
                </Badge>
              ))}
            </div>
            {canChat && (
              <Button variant="outline" size="sm" className="w-fit" asChild>
                <Link href="/admin/profile">
                  Chat name and avatar
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign-in</CardTitle>
            <CardDescription>
              Changing your email or password asks for your current password.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="a-email">Email</Label>
              <Input
                id="a-email"
                type="email"
                autoComplete="email"
                aria-invalid={!!e.email}
                {...register('email')}
              />
              {e.email && <p className="text-xs text-destructive">{e.email.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-new">New password</Label>
              <Input
                id="a-new"
                type="password"
                autoComplete="new-password"
                placeholder="Leave empty to keep your password"
                aria-invalid={!!e.newPassword}
                {...register('newPassword')}
              />
              {e.newPassword ? (
                <p className="text-xs text-destructive">{e.newPassword.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              )}
            </div>
            {needsCurrent && (
              <div className="grid gap-2">
                <Label htmlFor="a-current">Current password</Label>
                <Input
                  id="a-current"
                  type="password"
                  autoComplete="current-password"
                  {...register('currentPassword')}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
