import sharp from 'sharp'
import { payloadClient } from '@/i18n/data'
import { roomVisibility } from '@/chat/groups'
import { imageHeaders, load } from '@/lib/brand-images'

export const dynamic = 'force-dynamic'

/**
 * GET /brand/room/<id> — a public group's picture as a 600×600 JPEG, for link previews (WhatsApp & co. don't reliably
 * show the stored .webp). Hidden / members-only rooms and rooms without a picture → 404.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f]{24}$/i.test(id)) return new Response('Not found', { status: 404 })
  const payload = await payloadClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const room: any = await payload.findByID({ collection: 'chat-rooms', id, depth: 1, overrideAccess: true, disableErrors: true })
  const url = room && room.active !== false && room.photo && typeof room.photo === 'object' ? room.photo.url : null
  const allowed = room && (roomVisibility(room).vis === 'public' || new URL(req.url).searchParams.get('t') === room.inviteToken)
  if (!url || !allowed) return new Response(!room ? 'Not found' : !url ? 'No picture' : 'Not public', { status: 404 })
  try {
    const jpg = await sharp(await load(url, req.url)).resize(600, 600, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()
    return new Response(new Uint8Array(jpg), { headers: imageHeaders('image/jpeg') })
  } catch (e) {
    console.error('[brand] room picture: ' + (e as Error).message)
    return new Response('Picture unavailable', { status: 404 })
  }
}
