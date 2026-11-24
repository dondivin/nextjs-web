import { brandContext, brandIcon, imageHeaders } from '@/lib/brand-images'

export const dynamic = 'force-dynamic'
const SIZES = [16, 32, 48, 180, 192, 512]

/** GET /brand/icon/<size> — the platform icon as PNG (180 = Apple home-screen icon, never transparent). */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size)
  if (!SIZES.includes(size)) return new Response('Not found', { status: 404 })
  const png = await brandIcon(await brandContext(), size, req.url, size === 180)
  return new Response(new Uint8Array(png), { headers: imageHeaders('image/png') })
}
