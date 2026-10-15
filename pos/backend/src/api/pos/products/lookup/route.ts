import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules, QueryContext } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../../modules/pos"
import type PosModuleService from "../../../../modules/pos/service"
import { parsePosQuery } from "../../../pos-query"
import { GetPosProductLookup } from "../../validators"

// GET /pos/products/lookup?code=…&shift_id=… (TASKS P2-06): barcode scan.
// The code matches a variant's barcode, EAN, UPC or SKU exactly (BUILD_PLAN
// §6.2, POS recipe). Only published products in the register's sales channel
// are sold, priced in the shift's currency and the store's default region,
// as pos-checkout prices them.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { code, shift_id } = parsePosQuery(GetPosProductLookup, req.query)

  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const [shift] = await pos.listPosShifts({ id: shift_id })
  if (!shift) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Shift ${shift_id} was not found.`)
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [register],
  } = await query.graph({ entity: "pos_register", fields: ["id", "sales_channel.id"], filters: { id: shift.register_id } })
  const salesChannelId = register?.sales_channel?.id as string | undefined
  const [store] = await req.scope.resolve(Modules.STORE).listStores({})

  const matches = await req.scope.resolve(Modules.PRODUCT).listProductVariants(
    { $or: [{ barcode: code }, { ean: code }, { upc: code }, { sku: code }] },
    { select: ["id"], take: 20 }
  )
  const { data } = matches.length
    ? await query.graph({
        entity: "product_variant",
        fields: [
          "id",
          "title",
          "sku",
          "barcode",
          "ean",
          "upc",
          "product.id",
          "product.title",
          "product.thumbnail",
          "product.status",
          "product.sales_channels.id",
          "calculated_price.calculated_amount",
          "calculated_price.currency_code",
        ],
        filters: { id: matches.map((v) => v.id) },
        context: {
          calculated_price: QueryContext({
            currency_code: shift.currency_code,
            ...(store?.default_region_id ? { region_id: store.default_region_id } : {}),
          }),
        },
      })
    : { data: [] }

  // calculated_price is computed from the context, so the generated
  // product_variant type doesn't list it.
  type Priced = (typeof data)[number] & { calculated_price?: { calculated_amount?: number | null } | null }
  const variants = (data as Priced[])
    .filter(
      (v) =>
        v.product?.status === "published" &&
        !!salesChannelId &&
        (v.product?.sales_channels ?? []).some((sc) => sc?.id === salesChannelId)
    )
    .map(({ product, calculated_price, ...v }) => ({
      ...v,
      product: { id: product?.id, title: product?.title, thumbnail: product?.thumbnail ?? null },
      price: calculated_price?.calculated_amount ?? null,
      currency_code: shift.currency_code,
    }))
  if (!variants.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `No product for code ${code} in this shop.`)
  }
  res.json({ variants })
}
