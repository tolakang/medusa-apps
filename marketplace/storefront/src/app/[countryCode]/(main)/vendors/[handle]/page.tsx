import { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { getRegion } from "@lib/data/regions"
import { getVendorShop } from "@lib/data/vendors"
import { Heading, Text } from "@modules/common/components/ui"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import PaginatedProducts from "@modules/store/templates/paginated-products"

// A vendor's shop page (TASKS P6-08, plan §6.6): the vendor's name and logo
// and its published products, with this region's prices. Rendered per
// request, like the product pages.
export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { handle } = await props.params
  const shop = await getVendorShop(handle)
  if (!shop) {
    notFound()
  }
  return {
    title: `${shop.vendor.name} | Medusa Store`,
    description: `Products from ${shop.vendor.name}`,
  }
}

export default async function VendorPage(props: Props) {
  const { countryCode, handle } = await props.params
  const { page } = await props.searchParams
  const [shop, region] = await Promise.all([getVendorShop(handle), getRegion(countryCode)])
  if (!shop || !region) {
    notFound()
  }
  const pageNumber = page ? parseInt(page) : 1

  return (
    <div className="content-container py-6" data-testid="vendor-container">
      <div className="mb-8 flex items-center gap-4">
        {shop.vendor.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.vendor.logo}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        )}
        <div>
          <Heading level="h1" className="text-2xl-semi" data-testid="vendor-name">
            {shop.vendor.name}
          </Heading>
          <Text className="text-ui-fg-subtle">Sold on this marketplace</Text>
        </div>
      </div>
      {shop.product_ids.length ? (
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            page={pageNumber}
            productsIds={shop.product_ids}
            countryCode={countryCode}
          />
        </Suspense>
      ) : (
        <Text className="text-ui-fg-subtle">No products yet.</Text>
      )}
    </div>
  )
}
