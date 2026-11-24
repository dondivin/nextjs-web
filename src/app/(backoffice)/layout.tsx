import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/backoffice/components/theme-provider'
import { Toaster } from '@/backoffice/components/ui/sonner'
import { TooltipProvider } from '@/backoffice/components/ui/tooltip'
import './backoffice.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-jb' })

export const metadata: Metadata = {
  title: { default: 'OddsClub admin', template: '%s · OddsClub admin' },
  robots: { index: false, follow: false },
}

export default function BackofficeRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
