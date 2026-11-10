import { SELLER_KEY_META } from "@lib/config"
import { getSellerPublishableKey } from "@lib/data/seller"
import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

// TASKS P5-07: the seller's publishable key for browser-side calls (search),
// read by lib/config.ts. A publishable key is public.
export default async function RootLayout(props: { children: React.ReactNode }) {
  const sellerKey = await getSellerPublishableKey()
  return (
    <html lang="en" data-mode="light">
      <head>
        {sellerKey && <meta name={SELLER_KEY_META} content={sellerKey} />}
      </head>
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
