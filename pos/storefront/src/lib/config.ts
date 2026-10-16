import { getShopperIp } from "@lib/data/shopper-ip"
import { getLocaleHeader } from "@lib/util/get-locale-header"
import Medusa, { FetchArgs, FetchInput } from "@medusajs/js-sdk"

// Defaults to standard port for Medusa server
let MEDUSA_BACKEND_URL = "http://localhost:9000"

if (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) {
  MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
}

// Server-side only: prefer the private runtime URL (e.g. the Dokploy internal
// hostname) when set. The browser bundle keeps the public URL
// (BUILD_PLAN.md §4.2, starter change 6).
if (typeof window === "undefined" && process.env.MEDUSA_BACKEND_URL) {
  MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL
}

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

const originalFetch = sdk.client.fetch.bind(sdk.client)

// Requests the backend limits per IP (customer auth, password change) carry
// the shopper's IP and the shared SHOPPER_IP_SECRET (server-only env, same
// value on the backend). Only these paths: reading request headers makes a
// page dynamic, and other requests stay cacheable.
const SHOPPER_IP_PATHS = ["/auth/", "/store/customers/me/password"]

async function shopperIpHeaders(input: FetchInput): Promise<Record<string, string>> {
  const secret = process.env.SHOPPER_IP_SECRET?.trim()
  const path = typeof input === "string" ? input : ""
  if (typeof window !== "undefined" || !secret || !SHOPPER_IP_PATHS.some((p) => path.startsWith(p))) {
    return {}
  }
  const ip = await getShopperIp()
  return ip ? { "x-shopper-ip": ip, "x-shopper-ip-secret": secret } : {}
}

sdk.client.fetch = async <T>(
  input: FetchInput,
  init?: FetchArgs
): Promise<T> => {
  const headers = init?.headers ?? {}
  let localeHeader: Record<string, string | null> | undefined
  try {
    localeHeader = await getLocaleHeader()
    headers["x-medusa-locale"] ??= localeHeader["x-medusa-locale"]
  } catch {}

  const newHeaders = {
    ...localeHeader,
    ...(await shopperIpHeaders(input)),
    ...headers,
  }
  init = {
    ...init,
    headers: newHeaders,
  }
  return originalFetch(input, init)
}
