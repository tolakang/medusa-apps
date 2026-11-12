"use server"

import { sdk } from "@lib/config"
import { getCacheOptions } from "./cookies"

export type Locale = {
  code: string
  name: string
}

/**
 * Fetches available locales from the backend.
 * Returns null if the endpoint returns 404 (locales not configured).
 */
export const listLocales = async (): Promise<Locale[] | null> => {
  // Translations are off in this shop (the backend's /store/locales needs
  // the Translation module, behind a feature flag we don't enable), so the
  // starter's call only produced a 404 on every page. Ask only when
  // STOREFRONT_LOCALES=true (server-side; TASKS F-051). null hides the
  // language selector, as the starter does on a 404.
  if (process.env.STOREFRONT_LOCALES !== "true") {
    return null
  }
  const next = {
    ...(await getCacheOptions("locales")),
  }

  return sdk.client
    .fetch<{ locales: Locale[] }>(`/store/locales`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .then(({ locales }) => locales)
    .catch(() => null)
}
