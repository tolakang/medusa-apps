// TASKS P5-07: the request host as the seller's `domain` is stored (P5-01):
// lowercase, no port, no trailing dot, first of a comma list (proxies).
export function normalizeHost(raw: string | null | undefined): string | null {
  const first = (raw ?? "").split(",")[0].trim().toLowerCase()
  if (!first) {
    return null
  }
  const host = first.replace(/:\d+$/, "").replace(/\.$/, "")
  return /^[a-z0-9.-]+$/.test(host) ? host : null
}
