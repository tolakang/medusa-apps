import { getSiteOrigin } from "@/lib/util/site"
import type { MetadataRoute } from "next"

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getSiteOrigin()

  // A shop behind sign-in has nothing for crawlers (TASKS F-068).
  if (process.env.NEXT_PUBLIC_REQUIRE_LOGIN !== "false") {
    return { rules: { userAgent: "*", disallow: "/" } }
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/*/cart", "/*/checkout", "/*/account", "/*/order/", "/buy/"],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
