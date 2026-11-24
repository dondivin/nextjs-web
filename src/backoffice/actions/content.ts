'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { chatSchema, matchSchema, siteSchema, type ChatForm, type Localized, type MatchForm, type SiteForm } from '@/backoffice/lib/forms'
import { clearChatCache } from '@/chat/data'
import { AvatarError, dropMedia, storeBrandImage, storeHeroImage } from '@/chat/avatar'

const clean = (rows: Localized) => rows.map((r) => ({ locale: r.locale, value: r.value.trim() })).filter((r) => r.value)

/* ---------- matches (editors and moderators) ---------- */
function matchData(input: MatchForm) {
  const d = matchSchema.parse(input)
  return {
    ...d,
    league: d.league.trim(),
    // only keep what the status uses
    minute: d.status === 'live' ? d.minute : null,
    scoreHome: d.status === 'upcoming' ? null : d.scoreHome,
    scoreAway: d.status === 'upcoming' ? null : d.scoreAway,
  }
}

export async function saveMatch(id: string | null, input: MatchForm) {
  return run(async () => {
    await actionUser('editor', 'moderator')
    const payload = await payloadClient()
    const data = matchData(input)
    const doc = id ? await payload.update({ collection: 'matches', id, data }) : await payload.create({ collection: 'matches', data })
    revalidatePath('/admin', 'layout')
    return String(doc.id)
  })
}

export async function setMatchActive(id: string, active: boolean) {
  return run(async () => {
    await actionUser('editor', 'moderator')
    const payload = await payloadClient()
    await payload.update({ collection: 'matches', id, data: { active } })
    revalidatePath('/admin/matches')
  })
}

export async function deleteMatch(id: string) {
  return run(async () => {
    await actionUser('editor', 'moderator')
    const payload = await payloadClient()
    await payload.delete({ collection: 'matches', id })
    revalidatePath('/admin', 'layout')
  })
}

/* ---------- site settings (editors) ---------- */
export async function saveSiteSettings(input: SiteForm) {
  return run(async () => {
    await actionUser('editor')
    const d = siteSchema.parse(input)
    const payload = await payloadClient()
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { siteName: d.siteName, defaultPartner: d.defaultPartner || null, agentName: d.agentName, helpline: clean(d.helpline), companyLine: clean(d.companyLine), seoDescription: clean(d.seoDescription) },
    })
    clearChatCache()
    revalidatePath('/admin', 'layout')
  })
}

/* ---------- chat settings (moderators) ---------- */
export async function saveChatSettings(input: ChatForm) {
  return run(async () => {
    await actionUser('moderator')
    const d = chatSchema.parse(input)
    const words = [...new Set(d.bannedWords.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean))]
    const payload = await payloadClient()
    await payload.updateGlobal({
      slug: 'chat-settings',
      data: {
        slowModeSeconds: d.slowModeSeconds,
        maxLength: d.maxLength,
        rules: d.rules.map((r) => ({ icon: r.icon as never, title: clean(r.title), body: clean(r.body) })).filter((r) => r.title.length || r.body.length),
        bannedWords: words.map((word) => ({ word })),
      },
    })
    clearChatCache()
    revalidatePath('/admin', 'layout')
  })
}

/* ---------- brand images (editors): logo + link-preview image ---------- */
export async function setBrandImage(kind: 'logo' | 'share' | 'hero', fd: FormData | null) {
  return run(async () => {
    await actionUser('editor')
    const payload = await payloadClient()
    const site = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
    const field = kind === 'logo' ? 'logo' : kind === 'hero' ? 'heroImage' : 'shareImage'
    const old = site[field]
    const file = fd?.get('file')
    let id: string | number | null = null
    let transparent: boolean | undefined
    if (file instanceof File && file.size > 0) {
      try {
        if (kind === 'hero') ({ id, transparent } = await storeHeroImage(payload, file))
        else id = await storeBrandImage(payload, file, kind)
      } catch (e) {
        if (e instanceof AvatarError) {
          if (kind === 'hero') throw new Error(e.message === 'tooBig' ? 'That picture is over 10 MB.' : 'That file can’t be used. Use a PNG or WebP with a transparent background.')
          throw new Error(e.message === 'tooBig' ? 'That image is over 5 MB.' : 'That file can’t be used. Try SVG, PNG or JPG.')
        }
        throw e
      }
    }
    await payload.updateGlobal({ slug: 'site-settings', data: { [field]: id } })
    if (old) await dropMedia(payload, old)
    revalidatePath('/admin', 'layout')
    return { transparent }
  })
}
