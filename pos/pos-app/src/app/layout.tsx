import type { Metadata, Viewport } from "next"
import { ServiceWorker } from "@/components/service-worker"
import "./globals.css"

export const metadata: Metadata = {
  title: "POS",
  description: "Shop counter: scan, sell, take payment, print the receipt.",
  applicationName: "POS",
  appleWebApp: { capable: true, title: "POS", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
}

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
  // A till screen: no accidental pinch zoom.
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
