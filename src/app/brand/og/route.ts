import { brandContext, brandShareImage, imageHeaders } from '@/lib/brand-images'

export const dynamic = 'force-dynamic'

/** GET /brand/og — 1200×630 link-preview image (Open Graph / X cards). */
export async function GET(req: Request) {
  const jpg = await brandShareImage(await brandContext(), req.url)
  return new Response(new Uint8Array(jpg), { headers: imageHeaders('image/jpeg') })
}
