'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'

const schema = z.object({
  name: z.string().optional(),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'At least 8 characters'),
})
type Values = z.infer<typeof schema>

export function LoginForm({ firstUser, next }: { firstUser: boolean; next: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) })

  async function onSubmit(v: Values) {
    setError(null)
    const url = firstUser ? '/api/users/first-register' : '/api/users/login'
    const body = firstUser ? { email: v.email, password: v.password, name: v.name || undefined } : { email: v.email, password: v.password }
    const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const j = await res.json().catch(() => null)
      setError(j?.errors?.[0]?.message || 'The email or password is incorrect.')
      return
    }
    router.replace(next)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{firstUser ? 'Create the owner account' : 'Sign in'}</h1>
        <p className="text-sm text-muted-foreground">{firstUser ? 'This first account gets full access. You can invite your team afterwards.' : 'Use your OddsClub back-office account.'}</p>
      </div>
      {firstUser && (
        <div className="grid gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" autoComplete="name" {...register('name')} />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register('email')} />
        {formState.errors.email && <p className="text-xs text-destructive">{formState.errors.email.message}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete={firstUser ? 'new-password' : 'current-password'} aria-invalid={!!formState.errors.password} {...register('password')} />
        {formState.errors.password && <p className="text-xs text-destructive">{formState.errors.password.message}</p>}
      </div>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={formState.isSubmitting} className="w-full">
        {formState.isSubmitting && <Loader2 className="animate-spin" />}
        {firstUser ? 'Create account' : 'Sign in'}
      </Button>
      {!firstUser && <a href="/cms/forgot" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Forgot your password?</a>}
    </form>
  )
}
