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

export type CreateVendorProductInput = {
  vendor_admin_id: string
  product: CreateProductWorkflowInputDTO
}

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

    const productData = transform({ input, stores }, ({ input, stores }) => ({
      products: [
        {
          ...input.product,
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

    const product = transform({ createdProducts }, ({ createdProducts }) => createdProducts[0])
    return new WorkflowResponse({ product, vendor_id: vendorId })
  }
)
