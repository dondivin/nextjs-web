import sharp from 'sharp'
import type { Payload } from 'payload'

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']

export class AvatarError extends Error {}

/**
 * Turn an uploaded picture into a 256×256 WebP and store it in `media` (local disk or B2).
 * Re-encoding removes EXIF data (incl. GPS position) and anything that isn't a real image.
 * Returns the new media id.
 */
export async function storeAvatar(payload: Payload, file: File, owner: string) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new AvatarError('missing')
  if (file.size > AVATAR_MAX_BYTES) throw new AvatarError('tooBig')
  if (file.type && !TYPES.includes(file.type)) throw new AvatarError('type')
  let out: Buffer
  try {
    out = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize(512, 512, { fit: 'cover', position: 'attention' })   // sharp enough to open full size (tap the picture)
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    throw new AvatarError('type')
  }
  const doc = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: 'Chat avatar' },
    file: { data: out, mimetype: 'image/webp', name: `avatar-${owner}-${Date.now()}.webp`, size: out.length },
  })
  return doc.id
}

/** Delete a replaced avatar picture (ignore failures: an orphan file is harmless). */
export async function dropMedia(payload: Payload, id: unknown) {
  const mid = id && typeof id === 'object' && 'id' in id ? (id as { id: string }).id : id
  if (!mid) return
  try {
    await payload.delete({ collection: 'media', id: String(mid), overrideAccess: true })
  } catch {}
}

export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024

/** A chat picture: longest side ≤ 1600 px, WebP, EXIF (GPS…) removed, real images only. */
export async function prepareChatImage(file: File) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new AvatarError('missing')
  if (file.size > CHAT_IMAGE_MAX_BYTES) throw new AvatarError('tooBig')
  if (file.type && !TYPES.includes(file.type)) throw new AvatarError('type')
  try {
    const src = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000, animated: false }).rotate()
    const { data, info } = await src.clone()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true })
    // a tiny preview (~1 KB) that travels inside the message: shown blurred until the picture is downloaded
    const small = await src.clone().resize(32, 32, { fit: 'inside' }).webp({ quality: 40 }).toBuffer()
    return { data, w: info.width, h: info.height, thumb: 'data:image/webp;base64,' + small.toString('base64') }
  } catch {
    throw new AvatarError('type')
  }
}

/** A language icon (flag…): 128×128 WebP (SVG/PNG/JPG accepted; SVG is rasterised, so nothing scriptable is stored). */
export async function storeLanguageIcon(payload: Payload, file: File, code: string) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new AvatarError('missing')
  if (file.size > 2 * 1024 * 1024) throw new AvatarError('tooBig')
  if (file.type && ![...TYPES, 'image/svg+xml'].includes(file.type)) throw new AvatarError('type')
  let out: Buffer
  try {
    out = await sharp(Buffer.from(await file.arrayBuffer()), { density: 300, limitInputPixels: 20_000_000, animated: false })
      .resize(128, 128, { fit: 'cover', position: 'centre' })
      .webp({ quality: 90 })
      .toBuffer()
  } catch {
    throw new AvatarError('type')
  }
  const doc = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: `Language icon (${code})` },
    file: { data: out, mimetype: 'image/webp', name: `lang-${code}-${Date.now()}.webp`, size: out.length },
  })
  return doc.id
}

/** Platform logo → 512×512 PNG (transparency kept, nothing cropped). Share image → 1200×630 JPG. SVG is rasterised. */
export async function storeBrandImage(payload: Payload, file: File, kind: 'logo' | 'share' | 'icon') {
  if (!file || typeof file.arrayBuffer !== 'function') throw new AvatarError('missing')
  if (file.size > AVATAR_MAX_BYTES) throw new AvatarError('tooBig')
  if (file.type && ![...TYPES, 'image/svg+xml'].includes(file.type)) throw new AvatarError('type')
  let out: Buffer
  try {
    const img = sharp(Buffer.from(await file.arrayBuffer()), { density: 400, limitInputPixels: 60_000_000, animated: false }).rotate()
    out = kind === 'icon'
      // the tab icon: empty margins trimmed so the mark fills the square
      ? await sharp(await img.png().toBuffer()).trim({ threshold: 8 }).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer()
      : kind === 'logo'
      ? await img.resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer()
      : await img.resize(1200, 630, { fit: 'cover', position: 'attention' }).flatten({ background: '#081A30' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
  } catch {
    throw new AvatarError('type')
  }
  const ext = kind === 'share' ? 'jpg' : 'png'
  const doc = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: kind === 'logo' ? 'Logo' : kind === 'icon' ? 'Browser tab icon' : 'Share image' },
    file: { data: out, mimetype: kind === 'share' ? 'image/jpeg' : 'image/png', name: `brand-${kind}-${Date.now()}.${ext}`, size: out.length },
  })
  return doc.id
}

/**
 * First-screen person picture: transparency kept (WebP with alpha), longest side ≤ 1800 px, empty margins trimmed so the
 * person stands on the bottom edge. Reports whether the picture really has a transparent background.
 */
export async function storeHeroImage(payload: Payload, file: File) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new AvatarError('missing')
  if (file.size > 10 * 1024 * 1024) throw new AvatarError('tooBig')
  if (file.type && !['image/png', 'image/webp', 'image/avif', 'image/jpeg', 'image/heic', 'image/heif'].includes(file.type)) throw new AvatarError('type')
  let out: Buffer, transparent = false
  try {
    const src = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 80_000_000, animated: false }).rotate()
    const meta = await src.metadata()
    if (meta.hasAlpha) {
      const stats = await src.clone().stats()
      transparent = (stats.channels[3]?.min ?? 255) < 250 // some pixels really are see-through
    }
    let img = src
    if (transparent) img = img.trim({ threshold: 1 }) // cut empty transparent margins
    out = await img.resize(1800, 1800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 95 }).toBuffer()
  } catch {
    throw new AvatarError('type')
  }
  const doc = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: 'First screen picture' },
    file: { data: out, mimetype: 'image/webp', name: `brand-hero-${Date.now()}.webp`, size: out.length },
  })
  return { id: doc.id, transparent }
}

/**
 * A chat wallpaper: a photo ("cover") at most 2000 px and under ~450 KB, or a pattern tile ("tile") at most 600 px. WebP.
 */
export async function storeWallpaper(payload: Payload, file: File, name: string, mode: 'cover' | 'tile') {
  if (!file || typeof file.arrayBuffer !== 'function') throw new AvatarError('missing')
  if (file.size > 8 * 1024 * 1024) throw new AvatarError('tooBig')
  if (file.type && ![...TYPES, 'image/svg+xml'].includes(file.type)) throw new AvatarError('type')
  let out: Buffer = Buffer.alloc(0)
  try {
    const max = mode === 'tile' ? 600 : 2000
    const base = await sharp(Buffer.from(await file.arrayBuffer()), { density: 200, limitInputPixels: 60_000_000, animated: false }).rotate()
      .resize(max, max, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    for (const q of [82, 74, 66, 58, 50]) { out = await sharp(base).webp({ quality: q, effort: 5 }).toBuffer(); if (out.length <= 450 * 1024) break }
  } catch {
    throw new AvatarError('type')
  }
  const doc = await payload.create({ collection: 'media', overrideAccess: true, data: { alt: 'Wallpaper: ' + name }, file: { data: out, mimetype: 'image/webp', name: `wallpaper-${Date.now()}.webp`, size: out.length } })
  return { id: doc.id }
}

/** A sticker for the chat's picture editor: transparent margins trimmed, at most 512 px, WebP with transparency. */
export async function storeSticker(payload: Payload, file: File, name: string) {
  const { data: out, w, h } = await prepareSticker(file)
  const doc = await payload.create({ collection: 'media', overrideAccess: true, data: { alt: 'Sticker: ' + name }, file: { data: out, mimetype: 'image/webp', name: `sticker-${Date.now()}.webp`, size: out.length } })
  return { id: doc.id, w, h }
}
/** Every sticker has the same size: transparent margins trimmed, then centred in a 512 × 512 transparent square (WebP). */
export const STICKER_PX = 512
export const STICKER_MAX_BYTES = 100 * 1024
export async function prepareSticker(file: File) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new AvatarError('missing')
  if (file.size > 5 * 1024 * 1024) throw new AvatarError('tooBig')
  if (file.type && ![...TYPES, 'image/svg+xml'].includes(file.type)) throw new AvatarError('type')
  let out: Buffer = Buffer.alloc(0), w = 0, h = 0
  try {
    let img = sharp(Buffer.from(await file.arrayBuffer()), { density: 300, limitInputPixels: 40_000_000, animated: false }).rotate()
    const meta = await img.metadata()
    if (meta.hasAlpha) img = sharp(await img.trim({ threshold: 1 }).toBuffer())
    const square = await img.resize(STICKER_PX, STICKER_PX, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    // at most STICKER_MAX_BYTES (like WhatsApp's 100 KB for a sticker): lower the quality step by step until it fits
    for (const q of [90, 80, 70, 60, 50, 40, 30, 20]) {
      out = await sharp(square).webp({ quality: q, alphaQuality: q, effort: 5 }).toBuffer()
      if (out.length <= STICKER_MAX_BYTES) break
    }
    // last resort (very noisy pictures): smooth it slightly — still 512 × 512, always under the limit
    for (let blur = 0.6; out.length > STICKER_MAX_BYTES && blur <= 3; blur += 0.6) out = await sharp(square).blur(blur).webp({ quality: 40, alphaQuality: 40, effort: 6 }).toBuffer()
    w = STICKER_PX; h = STICKER_PX
  } catch {
    throw new AvatarError('type')
  }
  return { data: out, w, h }
}
