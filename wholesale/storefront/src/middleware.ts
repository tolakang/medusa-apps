import { HttpTypes } from "@medusajs/types"
import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
}

async function getRegionMap(cacheId: string) {
  const { regionMap, regionMapUpdated } = regionMapCache

  if (
    !regionMap.keys().next().value ||
    regionMapUpdated < Date.now() - 3600 * 1000
  ) {
    // Fetch regions from Medusa. We can't use the JS client here because middleware is running on Edge and the client needs a Node environment.
    const { regions } = await fetch(`${BACKEND_URL}/store/regions`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_API_KEY!,
      },
      next: {
        revalidate: 3600,
        tags: [`regions-${cacheId}`],
      },
    }).then(async (response) => {
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.message)
      }

      return json
    })

    if (!regions?.length) {
      throw new Error(
        "No regions found. Please set up regions in your Medusa Admin."
      )
    }

    // Create a map of country codes to regions.
    regions.forEach((region: HttpTypes.StoreRegion) => {
      region.countries?.forEach((c) => {
        regionMapCache.regionMap.set(c.iso_2 ?? "", region)
      })
    })

    regionMapCache.regionMapUpdated = Date.now()
  }

  return regionMapCache.regionMap
}

/**
 * Resolves the country code from the URL, falling back to the store default.
 * Not IP-based, so crawlers and AI agents get a stable redirect.
 */
async function getCountryCode(
  request: NextRequest,
  regionMap: Map<string, HttpTypes.StoreRegion | number>
) {
  try {
    let countryCode

    const urlCountryCode = request.nextUrl.pathname.split("/")[1]?.toLowerCase()

    if (urlCountryCode && regionMap.has(urlCountryCode)) {
      countryCode = urlCountryCode
    } else if (regionMap.has(DEFAULT_REGION)) {
      countryCode = DEFAULT_REGION
    } else if (regionMap.keys().next().value) {
      countryCode = regionMap.keys().next().value
    }

    return countryCode
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "Middleware.ts: Error getting the country code. Did you set up regions in your Medusa Admin and define a NEXT_PUBLIC_MEDUSA_BACKEND_URL environment variable?"
      )
    }
  }
}

async function setCacheId(request: NextRequest, response: NextResponse) {
  const cacheId = request.nextUrl.searchParams.get("_medusa_cache_id")

  if (cacheId) {
    return cacheId
  }

  const newCacheId = crypto.randomUUID()
  response.cookies.set("_medusa_cache_id", newCacheId, { maxAge: 60 * 60 * 24 })
  return newCacheId
}

// Wholesale: the shop is for signed-in buyers (BUILD_PLAN.md §6.4,
// NEXT_PUBLIC_REQUIRE_LOGIN, default on). Without a session cookie only the
// sign-in / sign-up page and the legal pages open; everything else goes to
// sign-in. This hides the shop's pages, not the Store API itself.
const REQUIRE_LOGIN = process.env.NEXT_PUBLIC_REQUIRE_LOGIN !== "false"
const PUBLIC_PAGES = ["account", "terms", "privacy", "contact"]

// The starter's machine-readable catalog and checkout for AI agents (UCP,
// /buy links, llms.txt, product Markdown, sitemap). They show products and
// prices to anyone, so they are off while sign-in is required.
const isAgentPath = (request: NextRequest) => {
  const path = request.nextUrl.pathname
  return (
    /^\/(ucp|buy|\.well-known\/ucp|llms\.txt|sitemap\.xml)(\/|$)/.test(path) ||
    path.endsWith(".md") ||
    (request.headers.get("accept") ?? "").includes("text/markdown")
  )
}

// What this session may see (TASKS F-068, REVIEW_FIXES X4), asked from the
// backend's own product route and remembered for a minute per token:
// "shop" = an employee of an approved company; "account" = signed in, but no
// company or one that isn't approved (only the account pages, where they
// see why); "signin" = no valid session. If the backend can't be reached the
// buyer is let through; the page then shows its own error.
type Access = "shop" | "account" | "signin"
const ACCESS_TTL_MS = 60 * 1000
const knownAccess = new Map<string, { access: Access; at: number }>()

async function sessionAccess(token: string | undefined): Promise<Access> {
  if (!token) {
    return "signin"
  }
  const known = knownAccess.get(token)
  if (known && known.at > Date.now() - ACCESS_TTL_MS) {
    return known.access
  }
  let access: Access = "shop"
  try {
    const res = await fetch(`${BACKEND_URL}/store/products?limit=1&fields=id`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_API_KEY!,
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })
    access = res.status === 401 ? "signin" : res.status === 403 ? "account" : "shop"
  } catch {
    return "shop"
  }
  if (knownAccess.size > 5000) {
    knownAccess.clear()
  }
  knownAccess.set(token, { access, at: Date.now() })
  return access
}

/**
 * Middleware to handle sign-in, region selection and cache id.
 */
export async function middleware(request: NextRequest) {
  if (isAgentPath(request)) {
    return REQUIRE_LOGIN
      ? new NextResponse(null, { status: 404 })
      : NextResponse.next()
  }
  const searchParams = request.nextUrl.searchParams
  const cartId = searchParams.get("cart_id")
  const checkoutStep = searchParams.get("step")
  const cacheIdCookie = request.cookies.get("_medusa_cache_id")
  const cartIdCookie = request.cookies.get("_medusa_cart_id")

  let redirectUrl = request.nextUrl.href

  let response = NextResponse.redirect(redirectUrl, 307)

  // Set a cache id to invalidate the cache for this instance only
  const cacheId = await setCacheId(request, response)

  const regionMap = await getRegionMap(cacheId)

  const countryCode = regionMap && (await getCountryCode(request, regionMap))

  const urlHasCountryCode =
    countryCode && request.nextUrl.pathname.split("/")[1].includes(countryCode)

  const isRoot = request.nextUrl.pathname === "/" && countryCode && !cartId

  if (
    REQUIRE_LOGIN &&
    countryCode &&
    (urlHasCountryCode || isRoot) &&
    !request.nextUrl.pathname.includes(".")
  ) {
    const page = request.nextUrl.pathname.split("/")[2] ?? ""
    if (!PUBLIC_PAGES.includes(page)) {
      const access = await sessionAccess(
        request.cookies.get("_medusa_jwt")?.value
      )
      if (access !== "shop") {
        const toAccount = NextResponse.redirect(
          `${request.nextUrl.origin}/${countryCode}/account`,
          307
        )
        if (access === "signin") {
          toAccount.cookies.delete("_medusa_jwt")
        }
        return toAccount
      }
    }
  }

  // Serve the page directly instead of redirecting to set the cache cookie, and
  // serve the default region at "/", so cookieless agents and crawlers get content.
  if ((urlHasCountryCode && (!cartId || cartIdCookie)) || isRoot) {
    const pageResponse = isRoot
      ? NextResponse.rewrite(new URL(`/${countryCode}`, request.url))
      : NextResponse.next()
    if (!cacheIdCookie) {
      pageResponse.cookies.set("_medusa_cache_id", cacheId, {
        maxAge: 60 * 60 * 24,
      })
    }
    return pageResponse
  }

  // check if the url is a static asset
  if (request.nextUrl.pathname.includes(".")) {
    return NextResponse.next()
  }

  const redirectPath =
    request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname

  const queryString = request.nextUrl.search ? request.nextUrl.search : ""

  // If no country code is set, we redirect to the relevant region.
  if (!urlHasCountryCode && countryCode) {
    redirectUrl = `${request.nextUrl.origin}/${countryCode}${redirectPath}${queryString}`
    response = NextResponse.redirect(`${redirectUrl}`, 307)
  }

  // If a cart_id is in the params, we set it as a cookie and redirect to the address step.
  if (cartId && !checkoutStep) {
    redirectUrl = `${redirectUrl}&step=address`
    response = NextResponse.redirect(`${redirectUrl}`, 307)
    response.cookies.set("_medusa_cart_id", cartId, { maxAge: 60 * 60 * 24 })
  }

  return response
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|images|assets|png|svg|jpg|jpeg|gif|webp).*)",
  ],
}
