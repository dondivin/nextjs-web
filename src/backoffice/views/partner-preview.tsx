'use client'
import { Anton } from 'next/font/google'
import type { ColorKey } from '@/backoffice/lib/partner-schema'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/** A miniature of the public site in the partner's colours: hero, 3D phone screen, odds board, footer. */
export function PartnerPreview({ c, name, promo, bonus }: { c: Record<ColorKey, string>; name: string; promo: string; bonus: string }) {
  const word = (name || 'Partner').toUpperCase()
  return (
    <div className="overflow-hidden rounded-xl border shadow-sm" style={{ background: c.night, color: '#F2F7FF' }} aria-label="Preview of the site in this partner’s colours">
      {/* nav */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: c.nav }}>
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide"><span className="size-3.5 rounded" style={{ background: c.cta }} />ODDSCLUB</span>
        <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: c.cta, color: c.ink }}>Open chat</span>
      </div>
      {/* hero */}
      <div className="relative px-4 pb-4 pt-3" style={{ background: `radial-gradient(120% 80% at 50% 0%, ${c.navy}, ${c.night})` }}>
        <div className="mx-auto mb-3 flex w-fit gap-0.5 rounded-full p-0.5 text-[9px] font-bold" style={{ background: c.nav }}>
          <span className="rounded-full px-2 py-1" style={{ background: c.cta, color: c.ink }}>{name || 'Partner'}</span>
          <span className="px-2 py-1 opacity-80">Other</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div>
            <p className={anton.className + ' text-[26px] leading-[.95]'}>EVERY SPORT.<br /><span style={{ color: c.cta }}>ONE CODE.</span></p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full px-2.5 py-1.5 text-[9px] font-bold uppercase" style={{ background: c.cta, color: c.ink }}>Claim the welcome bonus</span>
              <span className="rounded-full border border-dashed px-2.5 py-1 font-mono text-[9px] font-bold" style={{ borderColor: c.cta, color: c.cta }}>{promo || 'PROMO CODE'}</span>
            </div>
          </div>
          {/* phone */}
          <div className="w-[92px] rounded-[16px] p-[3px]" style={{ background: '#8a96a8' }}>
            <div className="flex h-[176px] flex-col gap-1.5 overflow-hidden rounded-[13px] px-2 pb-2 pt-3" style={{ background: c.night }}>
              <p className={anton.className + ' truncate text-[17px] leading-none'}>{word}</p>
              <span className="h-[3px] w-5 rounded" style={{ background: c.cta }} />
              <div className="rounded-md p-1.5 text-center" style={{ background: `linear-gradient(${c.blue}, ${c.panel})` }}>
                <span className="rounded px-1 text-[6px] font-bold" style={{ background: '#FF4D4D' }}>LIVE</span>
                <p className={anton.className + ' text-[18px] leading-tight'}>1 - 1</p>
              </div>
              {[0, 1].map((i) => <div key={i} className="h-4 rounded" style={{ background: c.panel }} />)}
              <div className="mt-auto flex justify-between rounded-md p-1" style={{ background: c.panel }}>
                <span className="rounded px-1.5 text-[6px] font-bold" style={{ background: c.cta, color: c.ink }}>Live</span>
                <span className="text-[6px]" style={{ color: c.mute }}>Odds</span>
                <span className="text-[6px]" style={{ color: c.mute }}>Chat</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* light section with odds */}
      <div className="px-4 py-3" style={{ background: c.tint, color: c.night }}>
        <p className={anton.className + ' mb-2 text-sm'}>YOUR EDGE ON EVERY MATCH.</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[['1', '2.40'], ['X', '3.10'], ['2', '2.90']].map(([k, v]) => (
            <span key={k} className="flex justify-between rounded-md px-2 py-1.5 text-[10px] font-bold" style={{ background: c.oddBg, color: c.odds }}><span className="opacity-70">{k}</span>{v}</span>
          ))}
        </div>
        <p className="mt-2 truncate text-[10px]" style={{ color: c.deep }}>Welcome bonus: <b>{bonus || '—'}</b></p>
      </div>
      {/* footer */}
      <div className="flex items-center gap-2 px-4 py-2 text-[9px]" style={{ background: c.deep, color: c.mute }}>
        <span className="rounded-full border px-1.5 font-bold" style={{ borderColor: c.mute }}>18+</span>Bet responsibly.
      </div>
    </div>
  )
}
