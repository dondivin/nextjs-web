import { brandContext, brandIcon, imageHeaders } from '@/lib/brand-images'

export const dynamic = 'force-dynamic'

/** /favicon.ico — browsers and crawlers ask for it directly. Served as a 48×48 PNG of the platform logo. */
export async function GET(req: Request) {
  const png = await brandIcon(await brandContext(), 48, req.url)
  return new Response(new Uint8Array(png), { headers: imageHeaders('image/png') })
}
