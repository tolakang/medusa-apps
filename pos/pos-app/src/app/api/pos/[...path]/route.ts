import { NextResponse, type NextRequest } from "next/server"
import { backendPosPath } from "@/lib/proxy-path"
import { backendFetch } from "@/lib/server/medusa"
import { clearToken, getToken } from "@/lib/server/session"

// /api/pos/* → backend /pos/* with the signed-in cashier's token (TASKS P2-10).
// Only the allow-listed cashier routes pass (proxy-path.ts). The cookie is
// SameSite=Strict and POSTs must come from this app's own pages (Origin
// check), so another site can't make the till sell or close a shift.

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ path: string[] }> }

const error = (status: number, message: string) => NextResponse.json({ message }, { status })

// Behind Dokploy's proxy the Host header is the app's public domain, the same
// host the browser puts in Origin. "null" or a malformed Origin is refused.
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin")
  try {
    return !!origin && new URL(origin).host === req.headers.get("host")
  } catch {
    return false
  }
}

async function handle(req: NextRequest, { params }: Params, method: "GET" | "POST") {
  const path = backendPosPath(method, (await params).path)
  if (!path) {
    return error(404, "Not found.")
  }
  if (method === "POST" && !sameOrigin(req)) {
    return error(403, "Requests must come from the POS app.")
  }
  const token = await getToken()
  if (!token) {
    return error(401, "Signed out. Sign in again.")
  }

  const query = Object.fromEntries(req.nextUrl.searchParams.entries())
  const body = method === "POST" ? await req.json().catch(() => ({})) : undefined
  const result = await backendFetch<unknown>(path, { token, method, body, query })
  if (!result.ok) {
    if (result.status === 401) {
      await clearToken()
    }
    return error(result.status, result.message)
  }
  return NextResponse.json(result.data, { status: result.status })
}

export const GET = (req: NextRequest, ctx: Params) => handle(req, ctx, "GET")
export const POST = (req: NextRequest, ctx: Params) => handle(req, ctx, "POST")
