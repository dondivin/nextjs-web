import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLanguages } from '@/i18n/data'

export const dynamic = 'force-dynamic'

/** "/" → the visitor's saved language, else the browser's language, else the default language. */
export default async function Root() {
  const languages = await getLanguages()
  const codes = languages.map((l) => l.code)
  const saved = (await cookies()).get('oc_locale')?.value
  if (saved && codes.includes(saved)) redirect('/' + saved)
  const accept = (await headers()).get('accept-language') || ''
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase()
    if (codes.includes(tag)) redirect('/' + tag)
    const base = tag.split('-')[0]
    if (codes.includes(base)) redirect('/' + base)
  }
  redirect('/' + (languages.find((l) => l.isDefault)?.code || codes[0] || 'en'))
}
