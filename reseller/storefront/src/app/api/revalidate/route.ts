import { timingSafeEqual } from "crypto"
import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

// Called by the backend after a catalog change (TASKS P1-10; Medusa guide
// "Revalidate Cache in Next.js Starter Storefront"). Only a caller with
// REVALIDATE_SECRET may clear the cache. revalidatePath("/", "layout")
// invalidates the Data Cache of every page; each page refetches on its next
// visit (Next.js docs, revalidatePath "Revalidating all data").
function secretMatches(given: string | null, expected: string) {
  if (!given) {
    return false
  }
  const encoder = new TextEncoder()
  const a = encoder.encode(given)
  const b = encoder.encode(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET
  if (!expected) {
    return NextResponse.json({ error: "Revalidation is not configured" }, { status: 404 })
  }
  if (!secretMatches(request.headers.get("x-revalidate-secret"), expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  revalidatePath("/", "layout")
  return NextResponse.json({ revalidated: true })
}
