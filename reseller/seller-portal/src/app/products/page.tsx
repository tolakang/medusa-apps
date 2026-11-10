import { Shell } from "@/components/shell"
import { requireSeller, sellerGet } from "@/lib/server/seller"
import { ProductForm } from "./product-form"

type Product = { id: string; title: string; handle: string; thumbnail: string | null; selected: boolean }

// TASKS P5-08: choose which of the shop's products appear in your shop.
export default async function ProductsPage() {
  const { token, seller } = await requireSeller()
  const { products } = await sellerGet<{ products: Product[] }>(token, "/sellers/me/products")
  return (
    <Shell seller={seller} active="/products">
      <p className="text-sm text-ui-fg-subtle">
        Ticked products show in your shop. Prices, stock and shipping come from the shop.
      </p>
      <ProductForm products={products} />
    </Shell>
  )
}
