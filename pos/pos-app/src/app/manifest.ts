import type { MetadataRoute } from "next"

// Installable on the shop's tablets (D5: PWA, TASKS P2-08/P2-10).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "POS counter",
    short_name: "POS",
    description: "Shop counter: scan, sell, take payment, print the receipt.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fafafa",
    theme_color: "#18181b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
