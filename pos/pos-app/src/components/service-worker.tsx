"use client"

import { useEffect } from "react"

// Registers /sw.js (PWA install, cached app shell). Production only, so
// development builds are never served from a stale cache.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined)
    }
  }, [])
  return null
}
