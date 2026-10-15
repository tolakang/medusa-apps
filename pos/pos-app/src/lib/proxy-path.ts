// The app's /api/pos/* proxy forwards only these backend routes (TASKS P2-06),
// with the signed-in cashier's token. Anything else (admin, store, auth, other
// prefixes, path tricks) is refused before a request leaves the app server.

const ALLOWED: { method: "GET" | "POST"; pattern: RegExp }[] = [
  { method: "GET", pattern: /^cashiers\/me$/ },
  { method: "GET", pattern: /^registers$/ },
  { method: "POST", pattern: /^shifts\/(open|close)$/ },
  { method: "POST", pattern: /^checkout$/ },
  { method: "GET", pattern: /^customers$/ },
  { method: "POST", pattern: /^customers$/ },
  { method: "GET", pattern: /^products\/lookup$/ },
]

// `segments` are the [...path] params after /api/pos/. Returns the backend
// path (/pos/...) or null when the call isn't allowed.
export function backendPosPath(method: string, segments: string[]): string | null {
  if (!segments.length || segments.some((s) => !/^[a-z]+$/.test(s))) {
    return null
  }
  const path = segments.join("/")
  const allowed = ALLOWED.some((a) => a.method === method && a.pattern.test(path))
  return allowed ? `/pos/${path}` : null
}
