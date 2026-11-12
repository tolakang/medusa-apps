import { NextRequest, NextResponse } from "next/server"

// TASKS P6-09: clears the session and opens sign-in (pages can't change
// cookies while rendering, so they send the vendor here).
//
// A link or image on another site must not sign a vendor out (REVIEW_FIXES
// C6): a cross-site request goes to the home page and keeps the session.
// Pages of this app redirect here same-origin, and so does a typed URL.
export function GET(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.redirect(new URL("/", request.url), 303)
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303)
  response.cookies.delete("vendor_session")
  return response
}
