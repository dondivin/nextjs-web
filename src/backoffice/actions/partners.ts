'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { partnerSchema, type PartnerForm } from '@/backoffice/lib/partner-schema'

export async function savePartner(id: string, input: PartnerForm) {
  return run(async () => {
    await actionUser('editor')
    const data = partnerSchema.parse(input)
    const payload = await payloadClient()
    const clash = await payload.find({ collection: 'partners', where: { and: [{ slug: { equals: data.slug } }, { id: { not_equals: id } }] }, limit: 1 })
    if (clash.docs.length) throw new Error('Another partner already uses that link id')
    await payload.update({ collection: 'partners', id, data: { ...data, texts: data.texts.filter((t) => t.bonus || t.payments) } })
    revalidatePath('/admin/partners')
    revalidatePath('/admin/partners/' + id)
  })
}

/** New partner, starting from a copy of an existing theme. */
export async function createPartner(copyFromId?: string) {
  return run(async () => {
    await actionUser('editor')
    const payload = await payloadClient()
    const all = await payload.find({ collection: 'partners', sort: '-order', pagination: false, depth: 0 })
    const base = all.docs.find((p) => String(p.id) === copyFromId) || all.docs[0]
    let n = all.docs.length + 1, slug = 'partner-' + n
    while (all.docs.some((p) => p.slug === slug)) slug = 'partner-' + ++n
    const doc = await payload.create({
      collection: 'partners',
      data: {
        name: 'New partner', slug, active: false, order: (all.docs[0]?.order || 0) + 1, texts: [],
        colors: base?.colors || { night: '#081A30', navy: '#0D2747', navy2: '#123460', panel: '#0F2C52', blue: '#1F6FE0', sky: '#4C9BFF', cta: '#7CC242', ink: '#0B1F05', odds: '#081A30', oddBg: '#E9EDF1', tint: '#D6DEE7', deep: '#1E3452', mute: '#9DB3CF', nav: '#0D2747' },
      },
    })
    revalidatePath('/admin/partners')
    return String(doc.id)
  })
}

export async function setPartnerActive(id: string, active: boolean) {
  return run(async () => {
    await actionUser('editor')
    const payload = await payloadClient()
    await payload.update({ collection: 'partners', id, data: { active } })
    revalidatePath('/admin/partners')
  })
}

export async function deletePartner(id: string) {
  return run(async () => {
    await actionUser('owner')
    const payload = await payloadClient()
    await payload.delete({ collection: 'partners', id })
    revalidatePath('/admin/partners')
  })
}
