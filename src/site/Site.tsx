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

type Props = { cfg: EngineConfig; initial: { bookmaker: string; promo: string; bonus: string; payments: string }; extras: { helpline: string; company: string; year: number }; languageSwitcher?: React.ReactNode; logoUrl?: string | null }

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

export default function Site({ cfg, initial, extras, languageSwitcher, logoUrl }: Props) {
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
          <a href="#chat" className="btn btn-primary">
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
              <a className="btn btn-primary" href="#chat-lounge">
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
      <div className="liquid" id="liquid" hidden aria-hidden="true"></div>
      <div className="messenger" id="messenger" data-ct="oddsclub" role="dialog" aria-modal="true" aria-labelledby="chatsTitle" aria-hidden="true">
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
              <button className="iconbtn" type="button" id="chatAccount" hidden aria-label={t('auth.accountAria')}>
                <Icon>{I.user}</Icon>
              </button>
              <button className="iconbtn" type="button" data-open-themes="" aria-label={t('chat.themeAria')}>
                <Icon>{I.palette}</Icon>
              </button>
              <a className="iconbtn" href="#matchday" aria-label={t('chat.closeAria')}>
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
            <input id="roomSearch" type="search" placeholder={t('chat.searchPlaceholder')} autoComplete="off" />
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
              <input id="picFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif" hidden />
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
            </form>
            <div className="gate glass" id="gate" hidden>
              <p id="gateText"></p>
              <button className="btn btn-primary" id="gateBtn" type="button">
                {t('chat.readRules')}
              </button>
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
        <div className="sheet glass">
          <h3 id="themeTitle">{r('themes.title')}</h3>
          <p>{t('themes.intro')}</p>
          <div className="themes" id="themeList" role="group" aria-label={t('themes.aria')}></div>
          <div className="sheet-actions">
            <button className="btn btn-primary" id="themeDone" type="button">
              {t('themes.done')}
            </button>
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
              <input id="authPassword" type="password" autoComplete="current-password" required minLength={8} maxLength={200} />
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
