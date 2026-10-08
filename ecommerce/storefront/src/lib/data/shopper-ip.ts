"use server"

import { headers as nextHeaders } from "next/headers"

// The shopper's IP, for the backend's per-IP limits on sign-in, sign-up and
// password emails (TASKS P1-21). These calls run on this server, so without
// it the backend would count every shopper as the storefront. Traefik puts the
// visitor in X-Real-Ip / X-Forwarded-For; behind another proxy (e.g.
// Cloudflare: cf-connecting-ip) name its header in CLIENT_IP_HEADER.
// Returns only the caller's own IP: the shared secret is added in
// lib/config.ts, which never runs this in the browser.
export async function getShopperIp(): Promise<string | null> {
  try {
    const headers = await nextHeaders()
    const name = process.env.CLIENT_IP_HEADER?.trim().toLowerCase()
    const raw =
      (name ? headers.get(name) : null) ?? headers.get("x-real-ip") ?? headers.get("x-forwarded-for")
    return raw?.split(",")[0]?.trim() || null
  } catch {
    return null
  }
}
