import React from 'react'
import { headers } from 'next/headers'
import { getLanguages } from '@/i18n/data'
import '@/site/styles/site.css'

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const languages = await getLanguages()
  const code = h.get('x-oc-locale') || languages[0]?.code || 'en'
  const lang = languages.find((l) => l.code === code) || languages[0]
  return (
    // translate="no" + <meta name="google" content="notranslate">: browser translators (Chrome / Google Translate) rewrite the
    // page before React starts (<font> wrappers, changed text), which breaks hydration and the live chat. The site has its own
    // languages (switcher in the nav), so automatic translation is turned off.
    <html lang={lang?.code || 'en'} dir={lang?.dir || 'ltr'} translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        {/* no viewport-fit=cover: in Safari it made iOS report the status / home bar areas as "safe areas" to keep free, which
            left empty bands above the top bar and under the chat's message box */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="google" content="notranslate" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  )
}
