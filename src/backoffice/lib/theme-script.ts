/** Shared by the server layout and the client theme provider (no 'use client' here). */
export const THEME_KEY = 'theme'

/** Runs before the page paints (inlined in <head> by the server layout): applies the saved light / dark choice. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light'}catch(_){}})()`
