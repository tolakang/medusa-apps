import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Vendor portal",
  description: "Choose the products you sell, follow your sales and commissions.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
