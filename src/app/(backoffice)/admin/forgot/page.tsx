import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BrandLogo } from '@/backoffice/components/brand-logo'
import { getBrand } from '@/lib/brand'
import { getBackofficeUser, payloadClient } from '@/backoffice/lib/server'
import { ForgotForm } from '@/backoffice/views/forgot-form'

export const metadata: Metadata = { title: 'Forgot your password' }
export const dynamic = 'force-dynamic'

export default async function ForgotPage() {
  const brand = await getBrand(await payloadClient())
  if (await getBackofficeUser()) redirect('/admin')
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-2 font-semibold">
          <BrandLogo url={brand.logoUrl} />
          {brand.siteName} admin
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <ForgotForm />
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_70%_30%,oklch(0.72_0.17_135/.35),transparent_70%),radial-gradient(50%_50%_at_20%_80%,oklch(0.55_0.15_255/.35),transparent_70%)]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-zinc-100">
          <p className="text-4xl font-semibold leading-tight tracking-tight text-balance">Every sport.<br />One code.</p>
          <p className="mt-3 max-w-md text-sm text-zinc-400">Manage partners and their themes, translations, matches and the community chat in one place.</p>
        </div>
      </div>
    </div>
  )
}
