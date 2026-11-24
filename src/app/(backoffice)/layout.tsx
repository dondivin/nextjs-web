import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/backoffice/components/theme-provider'
import { themeInitScript } from '@/backoffice/lib/theme-script'
import { Toaster } from '@/backoffice/components/ui/sonner'
import { TooltipProvider } from '@/backoffice/components/ui/tooltip'
import './backoffice.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-jb' })

export const metadata: Metadata = {
  title: { default: 'OddsClub admin', template: '%s · OddsClub admin' },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: '/brand/icon/32', sizes: '32x32', type: 'image/png' }], apple: [{ url: '/brand/icon/180', sizes: '180x180', type: 'image/png' }] },
}

export default function BackofficeRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* sets light / dark before the first paint (no flash) */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
