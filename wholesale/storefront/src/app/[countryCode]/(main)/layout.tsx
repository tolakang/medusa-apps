import { SessionProvider } from "@/lib/context/session-context"
import { getRegion } from "@/lib/data/regions"
import { retrieveSession } from "@/lib/data/session"
import { getBaseURL } from "@/lib/util/env"
import {
  SessionCartMismatchBanner,
  SessionFreeShippingNudge,
} from "@/modules/layout/components/session-banners"
import Footer from "@/modules/layout/templates/footer"
import { NavigationHeader } from "@/modules/layout/templates/nav"
import { Metadata } from "next"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const [session, region] = await Promise.all([
    retrieveSession(),
    getRegion(countryCode),
  ])

  return (
    <SessionProvider session={session}>
      <NavigationHeader currencyCode={region?.currency_code} />
      <SessionCartMismatchBanner />

      {props.children}

      <Footer />

      <SessionFreeShippingNudge />
    </SessionProvider>
  )
}
