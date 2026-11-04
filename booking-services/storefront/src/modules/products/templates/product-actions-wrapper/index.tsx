import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import { isServiceProduct } from "@lib/util/booking"
import BookingPicker from "@modules/products/components/booking-picker"
import ProductActions from "@modules/products/components/product-actions"

/**
 * Fetches real time pricing for a product and renders the product actions component.
 */
export default async function ProductActionsWrapper({
  id,
  region,
}: {
  id: string
  region: HttpTypes.StoreRegion
}) {
  const product = await listProducts({
    queryParams: { id: [id] },
    regionId: region.id,
  }).then(({ response }) => response.products[0])

  if (!product) {
    return null
  }

  // A bookable service gets the slot picker instead of "Add to cart" (P3-13).
  if (isServiceProduct(product)) {
    return <BookingPicker product={product} />
  }
  return <ProductActions product={product} region={region} />
}
