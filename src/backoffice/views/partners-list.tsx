'use client'
import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, Loader2, Plus, Star } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import { Button } from '@/backoffice/components/ui/button'
import { Badge } from '@/backoffice/components/ui/badge'
import { Switch } from '@/backoffice/components/ui/switch'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/backoffice/components/ui/card'
import { createPartner, setPartnerActive } from '@/backoffice/actions/partners'
import type { ColorKey } from '@/backoffice/lib/partner-schema'

export type PartnerCard = { id: string; name: string; slug: string; active: boolean; order: number; promoCode: string; signupUrl: string; colors: Record<ColorKey, string>; isDefault: boolean; languages: string[] }

export function PartnersList({ partners }: { partners: PartnerCard[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function add() {
    start(async () => {
      const r = await createPartner(partners[0]?.id)
      if (r.ok && r.data) { toast.success('Partner created. Fill in its details and colours.'); router.push('/admin/partners/' + r.data) } else if (!r.ok) toast.error(r.error)
    })
  }
  function toggle(p: PartnerCard, active: boolean) {
    start(async () => { const r = await setPartnerActive(p.id, active); if (r.ok) { toast.success(active ? `${p.name} is live on the site` : `${p.name} is hidden`); router.refresh() } else toast.error(r.error) })
  }
  return (
    <>
      <PageHeader title="Partners" description="Each partner re-themes the whole site and the 3D phone. Visitors switch between active partners in the hero.">
        <Button onClick={add} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}Add partner</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {partners.map((p) => {
          const missing = [!p.promoCode && 'promo code', !p.signupUrl && 'sign-up link', !p.languages.length && 'bonus text'].filter(Boolean)
          return (
            <Card key={p.id} className="gap-0 overflow-hidden py-0">
              <Link href={'/admin/partners/' + p.id} className="block" aria-label={`Edit ${p.name}`}>
                <div className="relative h-28 px-5 py-4" style={{ background: `linear-gradient(135deg, ${p.colors.navy}, ${p.colors.night})` }}>
                  <span className="text-2xl font-bold tracking-tight text-white">{p.name}</span>
                  <span className="absolute bottom-4 left-5 rounded-full px-3 py-1 text-xs font-bold" style={{ background: p.colors.cta, color: p.colors.ink }}>Claim bonus</span>
                  <div className="absolute right-4 top-4 flex -space-x-1.5">
                    {(['nav', 'blue', 'sky', 'cta', 'tint'] as ColorKey[]).map((k) => <span key={k} className="size-5 rounded-full ring-2 ring-black/20" style={{ background: p.colors[k] }} />)}
                  </div>
                </div>
              </Link>
              <CardHeader className="px-5 pt-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link href={'/admin/partners/' + p.id} className="hover:underline">{p.name}</Link>
                  {p.isDefault && <Badge variant="secondary"><Star className="fill-current" />Default</Badge>}
                  <Badge variant="outline" className="ml-auto font-mono text-[10px]">#b-{p.slug}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 text-sm text-muted-foreground">
                <div>Promo code: <span className="font-mono text-foreground">{p.promoCode || '—'}</span></div>
                {missing.length > 0 && <div className="mt-2 flex items-center gap-1.5 text-warning-foreground"><AlertTriangle className="size-3.5 text-warning" /><span>Missing {missing.join(', ')}</span></div>}
              </CardContent>
              <CardFooter className="justify-between border-t px-5 py-3">
                <label className="flex items-center gap-2 text-sm"><Switch checked={p.active} disabled={pending} onCheckedChange={(c) => toggle(p, c)} />{p.active ? 'Live' : 'Hidden'}</label>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" asChild><a href={`/#b-${p.slug}`} target="_blank" rel="noopener"><ExternalLink />View</a></Button>
                  <Button variant="outline" size="sm" asChild><Link href={'/admin/partners/' + p.id}>Edit</Link></Button>
                </div>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </>
  )
}
