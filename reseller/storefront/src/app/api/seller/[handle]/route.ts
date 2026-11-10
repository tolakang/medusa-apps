import { NextRequest, NextResponse } from "next/server"
import { SELLER_COOKIE } from "@lib/util/seller-cookie"

// SELLER_RESOLVE_MODE=path (TASKS P5-07): a seller's link /api/seller/<handle>
// remembers the seller for this browser and opens the shop. Outside /api the
// country middleware would redirect first. The backend still checks the
// handle (an unknown or inactive one gives your own channel).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params
  const response = NextResponse.redirect(new URL("/", request.url), 307)
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(handle)) {
    response.cookies.set(SELLER_COOKIE, handle, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })
  }
  return response
}
