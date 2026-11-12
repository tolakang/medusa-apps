import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import type { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createProductsWorkflow,
  createRemoteLinkStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import { trackedInventoryItems } from "../../lib/vendor-stock"

export type CreateVendorProductInput = {
  vendor_admin_id: string
  product: CreateProductWorkflowInputDTO
  // Stock at the vendor's location for its stock-tracked variants (F-080).
  stock?: { location_id: string; quantity: number } | null
}

// Puts the vendor's starting stock on the new product's stock-tracked
// variants (manage_inventory: Medusa made an inventory item for each), at
// the vendor's location. Compensation removes those levels.
const setVendorStockStep = createStep(
  "set-vendor-stock",
  async (
    input: { variant_ids: string[]; stock?: { location_id: string; quantity: number } | null },
    { container }
  ) => {
    if (!input.stock) {
      return new StepResponse([] as string[], [] as string[])
    }
    const items = Object.values(await trackedInventoryItems(container, input.variant_ids))
    if (!items.length) {
      return new StepResponse([] as string[], [] as string[])
    }
    const inventory = container.resolve(Modules.INVENTORY)
    const levels = await inventory.createInventoryLevels(
      items.map((inventory_item_id) => ({
        inventory_item_id,
        location_id: input.stock!.location_id,
        stocked_quantity: input.stock!.quantity,
      }))
    )
    const ids = levels.map((l) => l.id)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) {
      await container.resolve(Modules.INVENTORY).deleteInventoryLevels(ids)
    }
  }
)

// The vendor of the signed-in vendor admin (only an active vendor gets here:
// src/api/vendor-auth.ts).
const vendorOfAdminStep = createStep(
  "vendor-of-admin",
  async (vendorAdminId: string, { container }) => {
    const {
      data: [admin],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "vendor_admin",
      fields: ["vendor.id"],
      filters: { id: vendorAdminId },
    })
    if (!admin?.vendor?.id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found.")
    }
    return new StepResponse(admin.vendor.id as string)
  }
)

// create-vendor-product (BUILD_PLAN §6.6, TASKS P6-04), as in the official
// Vendors example: the product goes into the store's default sales channel,
// is created with createProductsWorkflow and linked to the vendor
// (vendor-product link, P6-02). Its status was already decided by the route
// (vendorProductStatus: draft until the marketplace publishes it).
export const createVendorProductWorkflow = createWorkflow(
  "create-vendor-product",
  function (input: CreateVendorProductInput) {
    const vendorId = vendorOfAdminStep(input.vendor_admin_id)

    const { data: stores } = useQueryGraphStep({
      entity: "store",
      fields: ["default_sales_channel_id"],
    })

    // The store's default shipping profile (Medusa's own migration makes it,
    // type "default"): without one, a cart with the product can't be
    // shipped ("The cart items require shipping profiles that are not
    // satisfied…", P6-15 test). The admin's product form asks for it; a
    // vendor's product gets the default unless the body names another.
    const { data: profiles } = useQueryGraphStep({
      entity: "shipping_profile",
      fields: ["id"],
      filters: { type: "default" },
    }).config({ name: "default-shipping-profile" })

    const productData = transform({ input, stores, profiles }, ({ input, stores, profiles }) => ({
      products: [
        {
          ...input.product,
          shipping_profile_id: input.product.shipping_profile_id ?? profiles[0]?.id,
          sales_channels: stores[0]?.default_sales_channel_id
            ? [{ id: stores[0].default_sales_channel_id }]
            : [],
        },
      ],
    }))

    const createdProducts = createProductsWorkflow.runAsStep({ input: productData })

    const links = transform({ vendorId, createdProducts }, ({ vendorId, createdProducts }) =>
      createdProducts.map((product) => ({
        [MARKETPLACE_MODULE]: { vendor_id: vendorId },
        [Modules.PRODUCT]: { product_id: product.id },
      }))
    )
    createRemoteLinkStep(links)

    const variantIds = transform({ createdProducts }, ({ createdProducts }) =>
      createdProducts.flatMap((p) => (p.variants ?? []).map((v) => v.id))
    )
    setVendorStockStep({ variant_ids: variantIds, stock: input.stock })

    const product = transform({ createdProducts }, ({ createdProducts }) => createdProducts[0])
    return new WorkflowResponse({ product, vendor_id: vendorId })
  }
)
