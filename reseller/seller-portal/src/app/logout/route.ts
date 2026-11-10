import { NextRequest, NextResponse } from "next/server"

// TASKS P5-08: clears the session and opens sign-in (pages can't change
// cookies while rendering, so they send the seller here).
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303)
  response.cookies.delete("seller_session")
  return response
}
