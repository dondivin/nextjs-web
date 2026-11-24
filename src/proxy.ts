import { NextResponse, type NextRequest } from 'next/server'

/** Passes the locale from the URL (/en, /fr…) to the root layout so <html lang> is right on the server. */
export function proxy(request: NextRequest) {
  const seg = request.nextUrl.pathname.split('/')[1] || ''
  const headers = new Headers(request.headers)
  if (/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(seg)) headers.set('x-oc-locale', seg)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!api|admin|_next|favicon.ico|.*\\..*).*)'],
}
