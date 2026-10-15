import "server-only"
import Medusa, { FetchError } from "@medusajs/js-sdk"

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
