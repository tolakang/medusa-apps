// Safety net for cached catalog data (TASKS P1-10): Next.js refetches it at
// most this many seconds after it was cached, even if the backend's revalidate
// call was missed or no event exists (price lists). Without it, "force-cache"
// keeps data forever (next patch-fetch: force-cache + no revalidate = false).
export const CATALOG_REVALIDATE_SECONDS = 600
