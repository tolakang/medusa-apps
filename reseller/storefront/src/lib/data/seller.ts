"use server"

import { cookies as nextCookies, headers as nextHeaders } from "next/headers"
import { unstable_rethrow } from "next/navigation"
import { SELLER_COOKIE } from "@lib/util/seller-cookie"

// Which seller a request belongs to (BUILD_PLAN §6.5, TASKS P5-07). One
// deployment serves every seller's domain; the backend maps the request's
// host (or, with SELLER_RESOLVE_MODE=path, the handle chosen at
// /api/seller/<handle>) to that seller's publishable key, and lib/config.ts
// sends it with every server-side request. No seller → your own channel's
// build-time key. Only ever runs on this server (lib/config.ts checks).

const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000"
const OWN_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
// Domain → key changes rarely; the backend lookup is cached this long.
const RESOLVE_REVALIDATE_SECONDS = 300

async function lookup(query: string): Promise<string | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/store/sellers/resolve?${query}`, {
      headers: { "x-publishable-api-key": OWN_KEY },
      cache: "force-cache",
      next: { revalidate: RESOLVE_REVALIDATE_SECONDS, tags: ["sellers"] },
    })
    if (!response.ok) {
      return null
    }
    const body = (await response.json()) as { publishable_key?: string }
    return body.publishable_key ?? null
  } catch {
    return null
  }
}

export async function getSellerPublishableKey(): Promise<string | null> {
  let query: string | null = null
  try {
    if ((process.env.SELLER_RESOLVE_MODE || "domain").toLowerCase() === "path") {
      const handle = (await nextCookies()).get(SELLER_COOKIE)?.value
      query = handle ? `handle=${encodeURIComponent(handle)}` : null
    } else {
      // The Host header, which Traefik passes through unchanged; not
      // x-forwarded-host, which a client could set.
      const host = (await nextHeaders()).get("host")
      query = host ? `domain=${encodeURIComponent(host)}` : null
    }
  } catch (error) {
    // Outside a request (e.g. at build): no seller. Next's own signals (a
    // page found to be dynamic) must pass, or a page would be cached with
    // your channel's data for every seller's domain.
    unstable_rethrow(error)
    return null
  }

  const found = query ? await lookup(query) : null
  if (found) {
    return found
  }
  const fallback = process.env.DEFAULT_SELLER_HANDLE?.trim()
  return fallback ? lookup(`handle=${encodeURIComponent(fallback)}`) : null
}
