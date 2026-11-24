/** The platform logo (Site settings → Brand & search) in the back office, or the default lightning mark. */
export function BrandLogo({ url, size = 32 }: { url?: string | null; size?: number }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="shrink-0 rounded-lg object-contain" style={{ width: size, height: size }} />
  return (
    <span className="flex shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" style={{ width: size / 2, height: size / 2 }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3L5 14h6l-1 7 8-11h-6z" /></svg>
    </span>
  )
}
