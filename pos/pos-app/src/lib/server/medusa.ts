import "server-only"
import Medusa, { FetchArgs, FetchError, FetchInput } from "@medusajs/js-sdk"
import { headers as nextHeaders } from "next/headers"

// Backend access from the app server only (TASKS P2-10). The browser talks to
// this app; this app talks to Medusa with the cashier's token, so the token
// never reaches the browser and the backend needs no CORS entry for the app.
// Server-side calls prefer the private Dokploy hostname (MEDUSA_BACKEND_URL),
// as the web client standard's change 6 does for the storefront.

const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

// "nostore": the SDK keeps no token itself; each call passes the cashier's.
export const sdk = new Medusa({
  baseUrl: BACKEND_URL,
  auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
})

// The backend limits sign-in, sign-up and invite codes per IP. These calls
// come from this server, so without the user's own IP every cashier would share
// one limit, and one person's wrong passwords would lock everyone out
// (REVIEW_FIXES C4). The IP goes with the shared SHOPPER_IP_SECRET (the same
// value as on the backend), as the storefront does. Traefik puts the visitor
// in X-Real-Ip / X-Forwarded-For; behind another proxy name its header in
// CLIENT_IP_HEADER.
const PER_IP_PATHS = ["/auth/", "/pos/cashiers/accept"]

async function clientIpHeaders(input: FetchInput): Promise<Record<string, string>> {
  const secret = process.env.SHOPPER_IP_SECRET?.trim()
  const path = typeof input === "string" ? input : ""
  if (!secret || !PER_IP_PATHS.some((p) => path.startsWith(p))) {
    return {}
  }
  try {
    const headers = await nextHeaders()
    const name = process.env.CLIENT_IP_HEADER?.trim().toLowerCase()
    const raw =
      (name ? headers.get(name) : null) ?? headers.get("x-real-ip") ?? headers.get("x-forwarded-for")
    const ip = raw?.split(",")[0]?.trim()
    return ip ? { "x-shopper-ip": ip, "x-shopper-ip-secret": secret } : {}
  } catch {
    return {}
  }
}

const originalFetch = sdk.client.fetch.bind(sdk.client)

sdk.client.fetch = async <T>(input: FetchInput, init?: FetchArgs): Promise<T> =>
  originalFetch(input, {
    ...init,
    headers: { ...(await clientIpHeaders(input)), ...(init?.headers ?? {}) },
  })

export type BackendResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; message: string }

export async function backendFetch<T>(
  path: string,
  init: { token?: string | null; method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = {}
): Promise<BackendResult<T>> {
  try {
    const data = await sdk.client.fetch<T>(path, {
      method: init.method ?? "GET",
      body: init.body as Record<string, unknown> | undefined,
      query: init.query,
      headers: init.token ? { authorization: `Bearer ${init.token}` } : {},
    })
    return { ok: true, status: 200, data }
  } catch (e) {
    if (e instanceof FetchError) {
      return { ok: false, status: e.status ?? 502, message: e.message || "The shop server refused the request." }
    }
    return { ok: false, status: 502, message: "The shop server can't be reached. Check the connection." }
  }
}
