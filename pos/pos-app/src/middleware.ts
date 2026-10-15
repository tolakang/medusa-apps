import { NextResponse, type NextRequest } from "next/server"

// Pages need a session cookie (TASKS P2-10); without one, go to sign-in. The
// cookie's content is checked server-side (session.ts, the API proxy); this
// only spares a round trip. API routes answer 401 themselves.
export function middleware(req: NextRequest) {
  if (!req.cookies.has("pos_session")) {
    return NextResponse.redirect(new URL("/login", req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!login|api|_next|icons|sw.js|manifest.webmanifest|favicon.ico).*)"],
}
