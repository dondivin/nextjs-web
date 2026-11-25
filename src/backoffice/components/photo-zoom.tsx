'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/backoffice/components/ui/dialog'

/** Wraps a profile / room picture: click (or Enter) to see it full size. Without a photo it is just the picture. */
export function PhotoZoom({ url, label = 'Picture', className = '', children }: { url: string | null | undefined; label?: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!url) return <>{children}</>
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`See the ${label.toLowerCase()} full size`} className={'cursor-zoom-in rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' + className}>
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(92vw,560px)] p-2">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}
