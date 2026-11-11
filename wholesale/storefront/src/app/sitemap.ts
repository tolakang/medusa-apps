import { sdk } from "@/lib/config"
import { listRegions } from "@/lib/data/regions"
import { getSiteOrigin, listCountryCodes } from "@/lib/util/site"
import type { MetadataRoute } from "next"

const STATIC_PATHS = [
  "",
  "/store",
  "/shipping",
  "/returns",
  "/terms",
  "/privacy",
  "/contact",
]
const PAGE_SIZE = 200

type Page<T> = { items: T[]; count: number }

async function listAll<T>(fetchPage: (offset: number) => Promise<Page<T>>) {
  const all: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { items, count } = await fetchPage(offset)
    all.push(...items)
    if (offset + PAGE_SIZE >= count || !items.length) {
      return all
    }
  }
}

// Built on request, never at build time: the build must not call the backend
// (BUILD_PLAN.md §4.2, change 5). While sign-in is required the middleware
// answers 404 here, and a guest can't read products anyway (TASKS F-068).
export const dynamic = "force-dynamic"

type Entry = { handle?: string | null; updated_at?: string | Date | null }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.NEXT_PUBLIC_REQUIRE_LOGIN !== "false") {
    return []
  }

  const query = { fields: "handle,updated_at", limit: PAGE_SIZE }

  const [origin, regions, products, categories, collections] =
    await Promise.all([
      getSiteOrigin(),
      listRegions(),
      listAll<Entry>((offset) =>
        sdk.store.product
          .list({ ...query, offset })
          .then((res) => ({ items: res.products, count: res.count }))
      ),
      listAll<Entry>((offset) =>
        sdk.store.category
          .list({ ...query, offset })
          .then((res) => ({ items: res.product_categories, count: res.count }))
      ),
      listAll<Entry>((offset) =>
        sdk.store.collection
          .list({ ...query, offset })
          .then((res) => ({ items: res.collections, count: res.count }))
      ),
    ])

  const toEntries = (base: string, prefix: string, items: Entry[]) =>
    items
      .filter((item) => item.handle)
      .map((item) => ({
        url: `${base}/${prefix}/${item.handle}`,
        lastModified: item.updated_at ? new Date(item.updated_at) : undefined,
      }))

  return listCountryCodes(regions).flatMap((countryCode) => {
    const base = `${origin}/${countryCode}`
    return [
      ...STATIC_PATHS.map((path) => ({ url: `${base}${path}` })),
      ...toEntries(base, "products", products),
      ...toEntries(base, "categories", categories),
      ...toEntries(base, "collections", collections),
    ]
  })
}
