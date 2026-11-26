'use client'
/*
 * Public site markup — mirrors design/prototype/oddsclub-prototype.html (lines 694–884).
 * Every id / class / data-attribute is kept identical: site.css and the engine depend on them.
 * All visible text comes from `cfg.strings` (translations in the database).
 */
import React, { useEffect } from 'react'
import { rich, plain } from '@/i18n/rich'
import { startEngine } from './engine/engine'
import type { EngineConfig } from './engine/types'

type Props = { cfg: EngineConfig; initial: { bookmaker: string; promo: string; bonus: string; payments: string }; extras: { helpline: string; company: string; year: number }; languageSwitcher?: React.ReactNode; logoUrl?: string | null; hero?: { url: string; w: number; h: number } | null; anyHero?: boolean; chat?: { room: string | null } }

const I = {
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4z" />
      <circle cx="7.5" cy="11.5" r="1" />
      <circle cx="9.5" cy="7.5" r="1" />
      <circle cx="14.5" cy="7.5" r="1" />
    </>
  ),
}
function Icon({ children, className = 'icon' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}
/** The platform logo (Site settings → Brand), or the default lightning mark. */
function BrandMark({ logoUrl }: { logoUrl?: string | null }) {
  if (logoUrl)
    return (
      <span className="brand-mark has-logo" aria-hidden="true">
        <img src={logoUrl} alt="" />
      </span>
    )
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
      </svg>
    </span>
  )
}

export default function Site({ cfg, initial, extras, languageSwitcher, logoUrl, hero, anyHero, chat }: Props) {
  const chatBase = `/${cfg.locale}/chat`
  const s = cfg.strings
  const t = (k: string) => (s[k] != null ? s[k] : k)
  const p = (k: string, v: Record<string, string | number> = {}) => plain(t(k), v)
  const tok = {
    bookmaker: <span className="js-bookmaker">{initial.bookmaker}</span>,
    code: <span className="js-code">{initial.promo}</span>,
    bonus: <span className="js-bonus">{initial.bonus}</span>,
    payments: <span className="js-pay">{initial.payments}</span>,
    siteName: cfg.siteName,
    helpline: extras.helpline,
    year: String(extras.year),
  }
  const r = (k: string) => rich(t(k), tok)

  useEffect(() => {
    startEngine(cfg)
  }, [cfg])

  return (
    <>
      <canvas id="phone3d" aria-hidden="true"></canvas>
      <button className="to-top" id="toTop" type="button" aria-label={t('toTop.aria')}>
        <svg className="ring" viewBox="0 0 56 56" aria-hidden="true">
          <circle className="track" cx="28" cy="28" r="25" />
          <circle className="prog" id="toTopProg" cx="28" cy="28" r="25" />
        </svg>
        <svg className="icon arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>

      <header className="nav">
        <a className="brand" href="#top">
          <BrandMark logoUrl={logoUrl} />
          {cfg.siteName}
        </a>
        <nav className="nav-links" aria-label={t('nav.mainAria')}>
          <a href="#join">{t('nav.bonus')}</a>
          <a href="#matchday">{t('nav.odds')}</a>
          {languageSwitcher}
          <a href={chatBase} className="btn btn-primary">
            <Icon>{I.chat}</Icon>
            {t('nav.openChat')}
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="h1">
          <div className="pitch-lines" aria-hidden="true"></div>
          <div className="beam l" aria-hidden="true"></div>
          <div className="beam r" aria-hidden="true"></div>
          {(hero || anyHero) && (
            // first-screen person picture (partner's own, else Site settings → First screen picture): decorative.
            // Rendered (hidden) even when the first partner has none, so the engine can show another partner's picture.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hero-person" src={hero?.url} hidden={!hero} alt="" aria-hidden="true" width={hero?.w || undefined} height={hero?.h || undefined} fetchPriority="high" decoding="async" />
          )}
          <div className="partners" id="partners" role="group" aria-label={t('hero.partnersAria')}>
            <span className="lbl">{t('hero.partnerLabel')}</span>
            <span className="p-pill" id="pPill" aria-hidden="true"></span>
          </div>
          <div className="p-word" id="pWord" aria-hidden="true">
            {initial.bookmaker}
          </div>
          <div className="drag-zone" id="dragZone" aria-hidden="true">
            <span className="drag-hint" id="dragHint">
              <Icon>
                <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
              </Icon>
              {t('hero.dragHint')}
            </span>
          </div>
          <h1 className="headline" id="h1">
            <span className="ln">
              <span>{t('hero.headline.1')}</span>
            </span>
            <span className="ln">
              <span>{t('hero.headline.2')}</span>
            </span>
          </h1>
          <div className="fallback" aria-hidden="true"></div>
          <div className="hero-foot">
            <p>{r('hero.intro')}</p>
            <div className="hero-cta">
              <a className="btn btn-primary js-signup" href="#join">
                {t('hero.claim')}
              </a>
              <button className="promo" type="button" data-copy-code="">
                <span className="lbl">{t('promo.label')}</span>
                <b className="js-code">{initial.promo}</b>
                <Icon>{I.copy}</Icon>
                <span className="sr">{t('promo.copyAria')}</span>
              </button>
            </div>
            <div className="ticker" aria-live="polite">
              <span className="live-dot" aria-hidden="true"></span>
              <span id="tickerText">{t('ticker.loading')}</span>
            </div>
          </div>
        </section>

        <section className="features" id="features" aria-labelledby="fh">
          <div className="pin">
            <div className="f-head">
              <span className="eyebrow">{t('features.eyebrow')}</span>
              <h2 id="fh">{t('features.title')}</h2>
            </div>
            <div className="f-grid">
              <div className="f-col left">
                <div className="callout" data-i="0">
                  <span className="ic">
                    <Icon>
                      <rect x="3" y="8" width="18" height="13" rx="2" />
                      <path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z" />
                    </Icon>
                  </span>
                  <h3>{t('features.bonus.title')}</h3>
                  <p>{r('features.bonus.body')}</p>
                  <span className="rule"></span>
                </div>
                <div className="callout" data-i="2">
                  <span className="ic">
                    <Icon>{I.chat}</Icon>
                  </span>
                  <h3>{t('features.chat.title')}</h3>
                  <p>{r('features.chat.body')}</p>
                  <span className="rule"></span>
                </div>
              </div>
              <div className="spacer" aria-hidden="true"></div>
              <div className="f-col">
                <div className="callout" data-i="1">
                  <span className="ic">
                    <Icon>
                      <path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6" />
                    </Icon>
                  </span>
                  <h3>{t('features.odds.title')}</h3>
                  <p>{r('features.odds.body')}</p>
                  <span className="rule"></span>
                </div>
                <div className="callout" data-i="3">
                  <span className="ic">
                    <Icon>{I.shieldCheck}</Icon>
                  </span>
                  <h3>{t('features.safe.title')}</h3>
                  <p>{r('features.safe.body')}</p>
                  <span className="rule"></span>
                </div>
              </div>
            </div>
            <div className="dots" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </div>
          </div>
        </section>

        <section className="join" id="join" aria-labelledby="jh">
          <div className="wrap join-grid">
            <div className="join-copy">
              <span className="eyebrow">{r('join.eyebrow')}</span>
              <h2 className="big" id="jh">
                {r('join.title')}
              </h2>
              <ol className="steps">
                {[1, 2, 3].map((n) => (
                  <li key={n}>
                    <span className="n">{n}</span>
                    <div>
                      <b>{r(`join.step${n}.title`)}</b>
                      <span>{r(`join.step${n}.body`)}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="join-cta">
                <a className="btn btn-primary js-signup" href="#join">
                  {t('join.signup')}
                </a>
                <a className="btn-text js-terms" href="#join">
                  {t('join.terms')}
                </a>
              </div>
            </div>
            <div className="codecard" aria-labelledby="ccl">
              <span className="cc-label" id="ccl">
                {t('join.codeLabel')}
              </span>
              <b className="cc-code js-code">{initial.promo}</b>
              <button className="btn btn-secondary" type="button" data-copy-code="">
                <Icon>{I.copy}</Icon>
                {t('join.copy')}
              </button>
              <div className="cc-bonus">
                <span>{t('join.bonusLabel')}</span>
                <b className="js-bonus">{initial.bonus}</b>
              </div>
              <p className="cc-small">{t('join.small')}</p>
            </div>
          </div>
        </section>

        <section className="board" id="matchday" aria-labelledby="bh">
          <div className="wrap">
            <div className="board-head">
              <h2 className="big" id="bh">
                {r('board.title')}
              </h2>
              <p className="board-note">{t('board.note')}</p>
            </div>
            <div className="lounge-cta">
              <div className="who">
                <span className="bubbleic">
                  <Icon>{I.chat}</Icon>
                </span>
                <div>
                  <b>{t('chat.lounge')}</b>
                  <span id="loungeInfo">{t('lounge.info')}</span>
                </div>
              </div>
              <a className="btn btn-primary" href={`${chatBase}/lounge`}>
                {t('nav.openChat')}
              </a>
            </div>
            <div className="sport-tabs" id="sportTabs" role="group" aria-label={t('board.sportsAria')}></div>
            <div className="matches" id="matches">
              <div className="empty">{t('board.empty')}</div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="rg" role="note">
            <span className="age">18+</span>
            <p>{r('footer.rg')}</p>
          </div>
          <p className="disclose">{r('footer.disclose')}</p>
          <div className="foot">
            <span>{p('footer.copyright', { year: extras.year, siteName: cfg.siteName })}</span>
            <span>{extras.company}</span>
          </div>
        </div>
      </footer>

      {/* ================= MESSENGER ================= */}
      <div className={'messenger' + (chat ? ' open' + (chat.room ? ' in-convo' : '') : '')} id="messenger" data-ct="oddsclub" role="region" aria-labelledby="chatsTitle" aria-hidden={chat ? 'false' : 'true'}>
        <aside className="m-side">
          <div className="side-head">
            <div className="side-brand">
              <BrandMark logoUrl={logoUrl} />
              <div>
                <h2 id="chatsTitle">{t('chat.title')}</h2>
                <small id="sideOnline">{t('chat.connecting')}</small>
              </div>
            </div>
            <div className="side-tools">
              <button className="iconbtn" type="button" id="newRoom" hidden aria-label={t('rooms.newAria')} title={t('rooms.newAria')}>
                <Icon>
                  <path d="M12 5v14M5 12h14" />
                </Icon>
              </button>
              <button className="iconbtn" type="button" id="chatAccount" hidden aria-label={t('auth.accountAria')}>
                <Icon>{I.user}</Icon>
              </button>
              <button className="iconbtn" type="button" data-open-themes="" aria-label={t('chat.themeAria')}>
                <Icon>{I.palette}</Icon>
              </button>
              <a className="iconbtn" id="chatClose" href={`/${cfg.locale}`} aria-label={t('chat.closeAria')}>
                <Icon>{I.close}</Icon>
              </a>
            </div>
          </div>
          <label className="search">
            <span className="sr">{t('chat.searchLabel')}</span>
            <Icon>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </Icon>
            <input id="roomSearch" type="search" placeholder={t('chat.searchPlaceholder2')} autoComplete="off" />
          </label>
          <div className="seg" id="seg" role="group" aria-label={t('chat.filterAria')}>
            <span className="pill" id="segPill" aria-hidden="true"></span>
            <button type="button" data-f="all" aria-pressed="true">
              {t('chat.filter.all')}
            </button>
            <button type="button" data-f="live" aria-pressed="false">
              {t('chat.filter.live')}
            </button>
            <button type="button" data-f="upcoming" aria-pressed="false">
              {t('chat.filter.upcoming')}
            </button>
          </div>
          <section className="people" id="people" aria-label={t('people.aria')} hidden>
            <div id="pplReq"></div>
            <div className="ppl-online" id="pplOnline" hidden>
              <div className="ppl-h">
                {t('people.online')}
                <b id="pplCount">0</b>
              </div>
              <div className="ppl-strip" id="pplRow"></div>
            </div>
            <div className="ppl-search" id="pplSearch" hidden>
              <div className="ppl-h">{t('people.title')}</div>
              <ul id="pplResults"></ul>
            </div>
          </section>
          <ul className="rooms" id="rooms">
            <li className="pill" id="roomPill" aria-hidden="true"></li>
          </ul>
          <button className="side-foot" id="rulesLink" type="button">
            <Icon>{I.shieldCheck}</Icon>
            {t('chat.rulesLink')}
          </button>
        </aside>
        <section className="convo" aria-label={t('chat.convoAria')}>
          <div className="c-top">
            <header className="c-head">
              <button className="iconbtn back" id="backBtn" type="button" aria-label={t('chat.back')}>
                <Icon>
                  <path d="M15 5l-7 7 7 7" />
                </Icon>
              </button>
              <div id="cAvatar"></div>
              <div className="c-title">
                <b id="cTitle">{t('chat.lounge')}</b>
                <span id="cSub">{t('chat.connecting')}</span>
              </div>
              <div id="cScore"></div>
              <button className="iconbtn" id="cManage" type="button" aria-label={t('rooms.manageAria')} title={t('rooms.manageAria')} hidden>
                <Icon>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                </Icon>
              </button>
              <button className="iconbtn" id="cLeave" type="button" aria-label={t('groups.leave')} title={t('groups.leave')} hidden>
                <Icon>
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
                </Icon>
              </button>
              <button className="iconbtn" id="cBlock" type="button" aria-label={t('pm.block')} title={t('pm.block')} hidden>
                <Icon>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M5.6 5.6l12.8 12.8" />
                </Icon>
              </button>
              <button className="iconbtn" type="button" data-open-themes="" aria-label={t('chat.themeAria')}>
                <Icon>{I.palette}</Icon>
              </button>
            </header>
            <button className="pinned" id="pinned" type="button">
              <span className="pi" aria-hidden="true">
                <svg className="icon" viewBox="0 0 24 24">
                  <path d="M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7z" />
                </svg>
              </span>
              <span>
                <b>{t('chat.pinned.title')}</b> · {t('chat.pinned.body')}
              </span>
            </button>
          </div>
          <div className="wall" id="wall" role="log" aria-live="polite" aria-label={t('chat.messagesAria')}>
            <div className="wall-in" id="wallIn"></div>
          </div>
          <button className="jump glass" id="jump" type="button" aria-label={t('chat.jumpAria')}>
            <Icon>
              <path d="M6 9l6 6 6-6" />
            </Icon>
            <i id="jumpCount" hidden></i>
          </button>
          <div className="dock">
            <div className="reply-wrap" id="replyWrap">
              <div>
                <div className="reply-bar glass" id="replyBar" aria-live="polite">
                  <span className="rb" aria-hidden="true"></span>
                  <div>
                    <b id="replyWho"></b>
                    <span id="replyText"></span>
                  </div>
                  {/* replying to a picture: its thumbnail */}
                  <img id="replyThumb" className="rb-thumb" alt="" hidden />
                  <button className="iconbtn" id="replyClose" type="button" aria-label={t('chat.cancelReply')}>
                    <Icon>{I.close}</Icon>
                  </button>
                </div>
              </div>
            </div>
            <div className="reply-wrap" id="picWrap">
              <div>
                <div className="reply-bar glass pic-bar" aria-live="polite">
                  <img id="picThumb" alt="" />
                  <div>
                    <b>{t('chat.photo')}</b>
                    <span id="picName"></span>
                  </div>
                  <button className="iconbtn" id="picClose" type="button" aria-label={t('chat.removePic')}>
                    <Icon>{I.close}</Icon>
                  </button>
                </div>
              </div>
            </div>
            <form className="composer glass" id="composer" hidden>
              <button className="attach" id="attachBtn" type="button" aria-label={t('chat.attachAria')} hidden>
                <Icon>{I.image}</Icon>
              </button>
              <input id="picFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif" multiple hidden />
              <label htmlFor="msgInput" className="sr">
                {t('chat.messageLabel')}
              </label>
              <textarea id="msgInput" rows={1} maxLength={cfg.chat.maxLength} placeholder={t('chat.placeholder')} autoComplete="off"></textarea>
              <span className="counter" id="counter">
                0/{cfg.chat.maxLength}
              </span>
              <button className="send" id="sendBtn" type="submit" aria-label={t('chat.sendAria')} disabled>
                <svg className="ring" viewBox="0 0 50 50" aria-hidden="true">
                  <circle id="slowRing" cx="25" cy="25" r="23" />
                </svg>
                <svg className="icon" id="sendIc" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
                <span className="slow" id="slowNum" hidden></span>
              </button>
              {/* voice message: the mic shows while the box is empty; recording swaps the box for the recording bar */}
              <button className="mic" id="micBtn" type="button" aria-label={t('voice.recordAria')} title={t('voice.recordAria')} hidden>
                <Icon>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </Icon>
              </button>
              <div className="rec-bar" id="recBar" hidden>
                <button className="rec-cancel" id="recCancel" type="button" aria-label={t('voice.cancel')} title={t('voice.cancel')}>
                  <Icon>
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </Icon>
                </button>
                <span className="rec-dot" aria-hidden="true"></span>
                <span className="rec-time" id="recTime" aria-live="off">0:00</span>
                <span className="rec-wave" id="recWave" aria-hidden="true"></span>
                <span className="sr" id="recStatus" role="status">{t('voice.recording')}</span>
                <button className="rec-send" id="recSend" type="button" aria-label={t('voice.send')} title={t('voice.send')}>
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5M6 11l6-6 6 6" />
                  </svg>
                </button>
              </div>
            </form>
            <div className="gate glass" id="gate" hidden>
              <p id="gateText"></p>
              <button className="btn btn-secondary" id="gateBtn2" type="button" hidden></button>
              <button className="btn btn-primary" id="gateBtn" type="button">
                {t('chat.readRules')}
              </button>
            </div>
          </div>
          {/* no conversation chosen yet (wide screens): a welcome page instead of opening one at random */}
          <div className="c-welcome" id="cWelcome" aria-labelledby="cwTitle">
            <div className="cw-in">
              <div className="cw-logo">
                <BrandMark logoUrl={logoUrl} />
              </div>
              <h2 id="cwTitle">{t('chat.title')}</h2>
              <p>{t('welcome.text')}</p>
              <ul className="cw-points">
                <li>
                  <Icon>
                    <path d="M4 5h16v11H8l-4 4z" />
                  </Icon>
                  {t('welcome.f1')}
                </li>
                <li>
                  <Icon>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16 11a3 3 0 1 0 0-6M21 19c0-2.4-1.6-4.3-4-4.8" />
                  </Icon>
                  {t('welcome.f2')}
                </li>
                <li>
                  <Icon>
                    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
                  </Icon>
                  {t('welcome.f3')}
                </li>
              </ul>
              <small className="cw-foot">{t('welcome.foot')}</small>
            </div>
          </div>
        </section>
      </div>

      <div className="ctx" id="ctx" data-ct="oddsclub" aria-hidden="true">
        <div className="ctx-bg" id="ctxBg"></div>
        <div className="ctx-react glass" id="ctxReact" role="toolbar" aria-label={t('ctx.reactAria')}></div>
        <div className="ctx-menu glass" id="ctxMenu" role="menu"></div>
      </div>

      <div className="sheet-wrap" id="rulesSheet" data-ct="oddsclub" role="dialog" aria-modal="true" aria-labelledby="rulesTitle" aria-hidden="true">
        <div className="sheet glass">
          <h3 id="rulesTitle">{r('rules.title')}</h3>
          <p>{t('rules.intro')}</p>
          <ul className="rules" id="rulesList"></ul>
          <label className="agree" id="agreeRow">
            <input type="checkbox" id="agree" />
            <span>{t('rules.agree')}</span>
          </label>
          <div className="sheet-actions">
            <button className="btn btn-secondary" id="rulesClose" type="button">
              {t('rules.close')}
            </button>
            <button className="btn btn-primary" id="rulesAccept" type="button" disabled>
              {t('rules.accept')}
            </button>
          </div>
        </div>
      </div>
      <div className="sheet-wrap" id="themeSheet" data-ct="oddsclub" role="dialog" aria-modal="true" aria-labelledby="themeTitle" aria-hidden="true">
        {/* two steps: 1 the theme (colours), 2 the bubble style (shape) — picking a theme moves on to step 2 */}
        <div className="sheet glass theme-steps" id="themeSteps" data-step="1">
          <div className="ts-pane" id="tsThemes">
            <h3 id="themeTitle">{r('themes.title')}</h3>
            <p>{t('themes.intro')}</p>
            <div className="themes" id="themeList" role="group" aria-label={t('themes.aria')}></div>
            <div className="sheet-actions">
              <button className="btn btn-secondary" id="toWalls" type="button">
                {t('walls.open')}
              </button>
              <button className="btn btn-secondary" id="toBubbles" type="button">
                {t('bubbles.open')}
              </button>
              <button className="btn btn-primary" id="themeDone" type="button">
                {t('themes.done')}
              </button>
            </div>
          </div>
          <div className="ts-pane" id="tsBubbles" hidden>
            <div className="ts-head">
              <button className="iconbtn" id="bubblesBack" type="button" aria-label={t('bubbles.back')} title={t('bubbles.back')}>
                <Icon>
                  <path d="M15 5l-7 7 7 7" />
                </Icon>
              </button>
              <h3 id="bubblesTitle">{r('bubbles.title')}</h3>
            </div>
            <p>{t('bubbles.intro')}</p>
            <div className="themes bubbles" id="bubbleList" role="group" aria-label={t('bubbles.aria')}></div>
            <div className="sheet-actions">
              <button className="btn btn-secondary" id="bubblesBack2" type="button">
                {t('bubbles.back')}
              </button>
              <button className="btn btn-secondary" id="bubblesNext" type="button">
                {t('walls.open')} →
              </button>
              <button className="btn btn-primary" id="bubblesDone" type="button">
                {t('themes.done')}
              </button>
            </div>
          </div>
          <div className="ts-pane" id="tsWalls" hidden>
            <div className="ts-head">
              <button className="iconbtn" id="wallsBack" type="button" aria-label={t('walls.back')} title={t('walls.back')}>
                <Icon>
                  <path d="M15 5l-7 7 7 7" />
                </Icon>
              </button>
              <h3 id="wallsTitle">{r('walls.title')}</h3>
            </div>
            <p>{t('walls.intro')}</p>
            <div className="themes walls" id="wallList" role="group" aria-label={t('walls.aria')}></div>
            {/* only for one of our wallpapers: how dark it is, for this device */}
            <div className="wall-dim" id="wallDim" hidden>
              <label htmlFor="wallDimRange">{t('walls.darken')}</label>
              <input type="range" id="wallDimRange" min={0} max={80} step={5} />
              <output id="wallDimVal" htmlFor="wallDimRange"></output>
            </div>
            <input type="file" id="wallFile" accept="image/*" hidden />
            <div className="sheet-actions">
              <button className="btn btn-primary" id="wallsDone" type="button">
                {t('themes.done')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="sheet-wrap" id="authSheet" data-ct="oddsclub" role="dialog" aria-modal="true" aria-labelledby="authTitle" aria-hidden="true">
        <div className="sheet glass">
          <h3 id="authTitle">{t('auth.signInTitle')}</h3>
          <p id="authIntro">{t('auth.signInIntro')}</p>
          <form className="auth-form" id="authForm" noValidate>
            <label className="field" id="authNameRow" hidden>
              <span>{t('auth.username')}</span>
              <input id="authName" type="text" autoComplete="nickname" minLength={2} maxLength={24} />
            </label>
            <div className="field" id="authAvatarRow" hidden>
              <span>{t('auth.avatar')}</span>
              <div className="ap">
                <span className="ap-prev" id="apPrev" aria-hidden="true">
                  <img id="apImg" alt="" hidden />
                  <b id="apIni"></b>
                </span>
                <div className="ap-btns">
                  <button className="btn-text" id="apUpload" type="button">
                    {t('auth.avatar.upload')}
                  </button>
                  <button className="btn-text" id="apShuffle" type="button">
                    {t('auth.avatar.shuffle')}
                  </button>
                  <button className="btn-text" id="apRemove" type="button" hidden>
                    {t('auth.avatar.remove')}
                  </button>
                </div>
              </div>
              <small>{t('auth.avatar.hint')}</small>
              <input id="apFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif" hidden />
            </div>
            <label className="field" id="authEmailRow">
              <span>{t('auth.email')}</span>
              <input id="authEmail" type="email" autoComplete="email" inputMode="email" required maxLength={200} />
            </label>
            <label className="field" id="authPwRow">
              <span id="authPwLabel">{t('auth.password')}</span>
              <span className="pw-wrap">
                <input id="authPassword" type="password" autoComplete="current-password" required minLength={8} maxLength={200} />
                {/* show / hide what was typed (engine: chatBackend.ts) */}
                <button className="pw-eye" id="authPwEye" type="button" aria-label={t('auth.showPassword')} aria-pressed="false" title={t('auth.showPassword')}>
                  <svg className="icon i-show" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                  <svg className="icon i-hide" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></svg>
                </button>
              </span>
              <small id="authPwHint" hidden>
                {t('auth.passwordHint')}
              </small>
            </label>
            <button className="btn-text auth-forgot" id="authForgot" type="button">
              {t('auth.forgot')}
            </button>
            <label className="field" id="authNoteRow" hidden>
              <span>{t('auth.note')}</span>
              <textarea id="authNote" rows={3} maxLength={500} placeholder={t('auth.notePlaceholder')}></textarea>
            </label>
            <p className="auth-error" id="authError" role="alert" hidden></p>
            <div className="sheet-actions">
              <button className="btn-text auth-switch" id="authSwitch" type="button">
                {t('auth.toSignUp')}
              </button>
              <button className="btn btn-secondary" id="authCancel" type="button">
                {t('auth.notNow')}
              </button>
              <button className="btn btn-primary" id="authSubmit" type="submit">
                {t('auth.submitSignIn')}
              </button>
            </div>
          </form>
          <div className="auth-notice" id="authNotice" hidden>
            <div className="sheet-actions">
              <button className="btn btn-secondary" id="authNoticeSecondary" type="button"></button>
              <button className="btn btn-primary" id="authNoticePrimary" type="button"></button>
            </div>
          </div>
          <div className="auth-account" id="authAccount" hidden>
            <div className="who">
              <span className="bubbleic ap-prev" id="authWhoAv">
                <img alt="" hidden />
                <b></b>
              </span>
              <div>
                <b id="authWho"></b>
                <small id="authWhoSub"></small>
              </div>
            </div>
            <div className="sheet-actions">
              <button className="btn-text auth-switch" id="authEdit" type="button">
                {t('auth.editProfile')}
              </button>
              <button className="btn btn-secondary" id="authSignOut" type="button">
                {t('auth.signOut')}
              </button>
              <button className="btn btn-primary" id="authDone" type="button">
                {t('auth.done')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="sheet-wrap" id="roomSheet" data-ct="oddsclub" role="dialog" aria-modal="true" aria-labelledby="rsTitle" aria-hidden="true">
        <div className="sheet glass room-sheet" id="rsBody"></div>
      </div>
      <div className="sheet-wrap" id="groupSheet" data-ct="oddsclub" role="dialog" aria-modal="true" aria-labelledby="gsTitle" aria-hidden="true">
        <div className="sheet glass group-sheet" id="gsBody"></div>
      </div>
      <div className="sheet-wrap" id="personSheet" data-ct="oddsclub" role="dialog" aria-modal="true" aria-labelledby="psName" aria-hidden="true">
        <div className="sheet glass person-sheet">
          <div className="ps-head">
            <div id="psAvatar"></div>
            <div>
              <h3 id="psName"></h3>
              <span id="psSub"></span>
            </div>
          </div>
          <p className="ps-msg" id="psMsg" hidden></p>
          <label className="field ps-note" id="psNoteRow" hidden>
            <span>{t('pm.noteLabel')}</span>
            <input id="psNote" type="text" maxLength={140} placeholder={t('pm.notePlaceholder')} autoComplete="off" />
          </label>
          <div className="sheet-actions ps-actions" id="psActions"></div>
        </div>
      </div>
      {/* in-app "are you sure?" (instead of the browser's confirm box): engine.ts → askConfirm() */}
      <div className="sheet-wrap confirm-wrap" id="confirmSheet" data-ct="oddsclub" role="alertdialog" aria-modal="true" aria-labelledby="cfTitle" aria-describedby="cfText" aria-hidden="true">
        <div className="sheet glass confirm-sheet">
          <h4 id="cfTitle"></h4>
          <p id="cfText"></p>
          <div className="sheet-actions">
            <button className="btn btn-secondary" id="cfCancel" type="button">{t('rooms.cancel')}</button>
            <button className="btn btn-primary" id="cfOk" type="button"></button>
          </div>
        </div>
      </div>
      <div className="toast" id="toast" role="status" aria-live="polite">
        <Icon>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </Icon>
        <span id="toastText"></span>
      </div>
    </>
  )
}
