import { sdk } from "@/lib/config"
import { getAuthHeaders } from "@/lib/data/cookies"
import { NextRequest, NextResponse } from "next/server"

// Product search for the browser. The backend's search route needs a
// signed-in customer (TASKS F-068), and the buyer's token is in an httpOnly
// cookie the browser can't read, so searches go through this route, which
// adds the token. Without a session it answers 401, like the backend.
export async function POST(req: NextRequest) {
  const auth = await getAuthHeaders()
  if (!("authorization" in auth)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 })
  }

  try {
    const result = await sdk.client.fetch<unknown>("/store/search", {
      method: "POST",
      body: body as Record<string, unknown>,
      headers: { ...auth },
      cache: "no-store",
    })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (e) {
    const status = (e as { status?: number })?.status
    return NextResponse.json(
      { message: "Search failed" },
      { status: status && status >= 400 && status < 500 ? status : 502 }
    )
  }
}
