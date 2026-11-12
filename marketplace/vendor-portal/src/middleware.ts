import { NextResponse, type NextRequest } from "next/server"

// Pages need a session cookie (TASKS P6-09, as the POS app); without one, go
// to sign-in. The cookie's content is checked server-side (lib/server).
export function middleware(req: NextRequest) {
  if (!req.cookies.has("vendor_session")) {
    return NextResponse.redirect(new URL("/login", req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!login|logout|_next|favicon.ico).*)"],
}
