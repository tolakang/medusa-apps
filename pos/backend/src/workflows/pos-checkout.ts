import type { CreateOrderWorkflowInput } from "@medusajs/medusa/core-flows"
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
  Modules,
  OrderStatus,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  authorizePaymentSessionStep,
  capturePaymentWorkflow,
  convertDraftOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
  createRemoteLinkStep,
  releaseLockStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { ensurePosInStoreOptionWorkflow } from "./pos-in-store"
import { POS_PAYMENT_METHOD_KEY } from "./pos-shift"

// pos-checkout (BUILD_PLAN §6.2, TASKS P2-05), as in Medusa's POS recipe: the
// sale is a draft order in the register's sales channel (createOrderWorkflow
// with status draft, as the admin draft-order route does), promotions through
// promo_codes, converted to an order (convertDraftOrderWorkflow), paid in full
// and linked to the cashier's open shift. The goods leave the shop at the
// counter, so the sale takes stock only from the register's stock location
// (P2-11): stock is checked there first, the reservations Medusa made on
// convert move there, and the order is fulfilled from there at once.

export const POS_PAYMENT_METHODS = ["cash", "card", "qr"] as const
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number]

// The cashier takes the money (cash drawer, card terminal, KHQR stand) and the
// sale records it with Medusa's system provider (TASKS F-038).
export const POS_PAYMENT_PROVIDER_ID = "pp_system_default"

export type PosCheckoutInput = {
  shift_id: string
  cashier_id: string
  items: { variant_id: string; quantity: number }[]
  payment_method: PosPaymentMethod
  customer_id?: string
  email?: string
  promo_codes?: string[]
}

const validatePosCheckoutStep = createStep(
  "validate-pos-checkout",
  async (input: PosCheckoutInput, { container }) => {
    if (!POS_PAYMENT_METHODS.includes(input.payment_method)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The payment method must be one of ${POS_PAYMENT_METHODS.join(", ")}.`
      )
    }
    if (!input.items?.length || input.items.some((i) => !(Number.isInteger(i.quantity) && i.quantity > 0))) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Add at least one item, each with a quantity of 1 or more.")
    }

    const pos: PosModuleService = container.resolve(POS_MODULE)
    const [shift] = await pos.listPosShifts({ id: input.shift_id })
    if (!shift) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Shift ${input.shift_id} was not found.`)
    }
    if (shift.status !== "open") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This shift is closed. Open a shift to sell.")
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [register],
    } = await query.graph({
      entity: "pos_register",
      fields: ["id", "is_active", "sales_channel.id", "stock_location.id", "stock_location.name"],
      filters: { id: shift.register_id },
    })
    if (!register?.is_active) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This register is not active.")
    }
    const salesChannelId = register.sales_channel?.id
    if (!salesChannelId) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This register has no sales channel. Set it up in the admin.")
    }
    const stockLocationId = register.stock_location?.id
    if (!stockLocationId) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This register has no stock location. Set it up in the admin.")
    }

    // Prices and taxes come from the store's default region (Cambodia, seed).
    const [store] = await container.resolve(Modules.STORE).listStores({})
    if (!store?.default_region_id) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The store has no default region.")
    }

    return new StepResponse({
      register_id: register.id as string,
      sales_channel_id: salesChannelId as string,
      stock_location_id: stockLocationId as string,
      stock_location_name: (register.stock_location?.name ?? "this shop") as string,
      region_id: store.default_region_id,
      currency_code: shift.currency_code,
    })
  }
)

type PosPaymentSessionInput = {
  payment_collection_id: string
  currency_code: string
  amount: number
  payment_method: PosPaymentMethod
}

// Not createPaymentSessionsWorkflow: its input has no metadata, and the cash
// marker must sit on the session (F-037, read by close-pos-shift).
const createPosPaymentSessionStep = createStep(
  "create-pos-payment-session",
  async (input: PosPaymentSessionInput, { container }) => {
    const session = await container.resolve(Modules.PAYMENT).createPaymentSession(input.payment_collection_id, {
      provider_id: POS_PAYMENT_PROVIDER_ID,
      currency_code: input.currency_code,
      amount: input.amount,
      data: {},
      metadata: { [POS_PAYMENT_METHOD_KEY]: input.payment_method },
    })
    return new StepResponse(session, session.id)
  },
  async (sessionId: string | undefined, { container }) => {
    if (!sessionId) {
      return
    }
    await container.resolve(Modules.PAYMENT).deletePaymentSession(sessionId)
  }
)

type ShopStockInput = {
  items: { variant_id: string; quantity: number }[]
  stock_location_id: string
  stock_location_name: string
}

// The shop must hold the items (P2-11): stocked minus reserved at the
// register's location, for every inventory item of a managed variant.
// Variants that allow backorder or don't manage inventory always pass.
const checkPosShopStockStep = createStep("check-pos-shop-stock", async (input: ShopStockInput, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "title",
      "manage_inventory",
      "allow_backorder",
      "product.title",
      "inventory_items.inventory_item_id",
      "inventory_items.required_quantity",
      "inventory_items.inventory.location_levels.location_id",
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
    filters: { id: [...new Set(input.items.map((i) => i.variant_id))] },
  })
  // Total needed per inventory item across the sale's lines.
  const needed = new Map<string, { qty: number; label: string; available: number }>()
  for (const item of input.items) {
    const v = variants.find((x) => x.id === item.variant_id)
    if (!v || !v.manage_inventory || v.allow_backorder) {
      continue
    }
    for (const link of v.inventory_items ?? []) {
      if (!link?.inventory_item_id) continue
      const level = (link.inventory?.location_levels ?? []).find((l) => l?.location_id === input.stock_location_id)
      const available = level
        ? MathBN.sub(level.stocked_quantity as number, level.reserved_quantity as number).toNumber()
        : 0
      const entry = needed.get(link.inventory_item_id) ?? {
        qty: 0,
        label: [v.product?.title, v.title].filter(Boolean).join(" · "),
        available,
      }
      entry.qty += Number(link.required_quantity ?? 1) * item.quantity
      needed.set(link.inventory_item_id, entry)
    }
  }
  const short = [...needed.values()].filter((n) => n.available < n.qty)
  if (short.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Not enough stock at ${input.stock_location_name}: ${short
        .map((n) => `${n.label} (${Math.max(0, n.available)} left)`)
        .join(", ")}.`
    )
  }
  return new StepResponse(undefined)
})

type ReservationCopy = {
  line_item_id: string
  inventory_item_id: string
  location_id: string
  quantity: number
  allow_backorder: boolean
}

// convertDraftOrderWorkflow reserves at the first location of the sales
// channel with enough stock (prepareConfirmInventoryInput). A counter sale
// takes from the register's location, so each reservation elsewhere is
// replaced by the same reservation at the shop: delete, then create (each
// adjusts its own location's reserved quantity). Not updateReservationItems
// with a new location_id: in 2.21.2 it releases nothing at the old location
// (it only loads the new location's levels; TASKS F-041).
// Compensation deletes only the shop reservations created here. The originals
// belong to convertDraftOrderWorkflow's reserveInventoryStep, whose own
// compensation (deleting them by id) runs next in the rollback and finds them
// already gone, which changes nothing; recreating them here would give them
// new ids that nothing deletes, leaving stale reserved stock.
const movePosReservationsStep = createStep(
  "move-pos-reservations",
  async (input: { order_id: string; stock_location_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [order],
    } = await query.graph({ entity: "order", fields: ["id", "items.id"], filters: { id: input.order_id } })
    const lineIds = (order?.items ?? []).map((i) => i!.id)
    const inventory = container.resolve(Modules.INVENTORY)
    const reservations = lineIds.length ? await inventory.listReservationItems({ line_item_id: lineIds }) : []
    const elsewhere = reservations.filter((r) => r.location_id !== input.stock_location_id)
    if (!elsewhere.length) {
      return new StepResponse(0, { removed: [] as ReservationCopy[], created: [] as string[] })
    }
    const removed: ReservationCopy[] = elsewhere.map((r) => ({
      line_item_id: r.line_item_id as string,
      inventory_item_id: r.inventory_item_id,
      location_id: r.location_id,
      quantity: Number(r.quantity),
      allow_backorder: !!r.allow_backorder,
    }))
    await inventory.deleteReservationItems(elsewhere.map((r) => r.id))
    const created = await inventory.createReservationItems(
      removed.map((r) => ({ ...r, location_id: input.stock_location_id }))
    )
    return new StepResponse(created.length, { removed, created: created.map((c) => c.id) })
  },
  async (moved: { removed: ReservationCopy[]; created: string[] } | undefined, { container }) => {
    if (!moved?.created.length) {
      return
    }
    await container.resolve(Modules.INVENTORY).deleteReservationItems(moved.created)
  }
)

export const posCheckoutWorkflow = createWorkflow("pos-checkout", function (input: PosCheckoutInput) {
  // Same key as close-pos-shift: a sale and the shift close never interleave.
  const lockKey = transform({ input }, ({ input }) => `pos-shift:${input.shift_id}`)
  acquireLockStep({ key: lockKey, timeout: 10, ttl: 120 })
  const context = validatePosCheckoutStep(input)
  const stockInput = transform({ input, context }, ({ input, context }) => ({
    items: input.items,
    stock_location_id: context.stock_location_id,
    stock_location_name: context.stock_location_name,
  }))
  checkPosShopStockStep(stockInput)
  const inStore = ensurePosInStoreOptionWorkflow.runAsStep({
    input: transform({ context }, ({ context }) => ({ stock_location_id: context.stock_location_id })),
  })

  const draftInput = transform({ input, context }, ({ input, context }) => {
    // The admin draft-order route passes is_draft_order the same way
    // (@medusajs/medusa api/admin/draft-orders/route.js); CreateOrderDTO lacks it.
    const data: CreateOrderWorkflowInput & { is_draft_order: boolean } = {
      status: OrderStatus.DRAFT,
      is_draft_order: true,
      region_id: context.region_id,
      sales_channel_id: context.sales_channel_id,
      currency_code: context.currency_code,
      customer_id: input.customer_id,
      email: input.email,
      // Title and price come from the variant (createOrderWorkflow prices
      // variant items itself, like the admin route's items without them).
      items: input.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })) as CreateOrderWorkflowInput["items"],
      promo_codes: input.promo_codes ?? [],
      metadata: { pos_register_id: context.register_id, pos_shift_id: input.shift_id, pos_cashier_id: input.cashier_id },
    }
    return data
  })
  const draft = createOrderWorkflow.runAsStep({ input: draftInput })
  const orderId = transform({ draft }, ({ draft }) => draft.id)
  convertDraftOrderWorkflow.runAsStep({ input: { id: orderId } })
  movePosReservationsStep(
    transform({ orderId, context }, ({ orderId, context }) => ({
      order_id: orderId,
      stock_location_id: context.stock_location_id,
    }))
  )

  const { data: orders } = useQueryGraphStep({
    entity: "order",
    fields: ["id", "total", "currency_code", "items.id", "items.quantity"],
    filters: { id: orderId },
  }).config({ name: "get-pos-order-total" })
  const total = transform({ orders }, ({ orders }) => MathBN.convert(orders[0].total as number).toNumber())

  // A sale fully covered by promotions has nothing to pay.
  when("pos-checkout-has-payment", { total }, ({ total }) => total > 0).then(() => {
    const collections = createOrderPaymentCollectionWorkflow.runAsStep({
      input: { order_id: orderId, amount: total },
    })
    const sessionInput = transform({ collections, input, total }, ({ collections, input, total }) => ({
      payment_collection_id: collections[0].id,
      currency_code: collections[0].currency_code,
      amount: total,
      payment_method: input.payment_method,
    }))
    const session = createPosPaymentSessionStep(sessionInput)
    const payment = authorizePaymentSessionStep({ id: session.id, context: {} })
    const paymentId = transform({ payment }, ({ payment }) => payment!.id)
    capturePaymentWorkflow.runAsStep({
      input: { payment_id: paymentId, captured_by: input.cashier_id, amount: total },
    })
  })

  // Handed over at the counter: fulfil every line from the shop now, which
  // subtracts the quantities from the shop's stocked quantity and releases
  // the reservations (createOrderFulfillmentWorkflow). No customer notice.
  const fulfillmentInput = transform({ orders, context, inStore, input }, ({ orders, context, inStore, input }) => ({
    order_id: orders[0].id,
    items: (orders[0].items ?? []).map((i) => ({ id: i!.id, quantity: Number(i!.quantity) })),
    location_id: context.stock_location_id,
    shipping_option_id: inStore.shipping_option_id,
    no_notification: true,
    created_by: input.cashier_id,
  }))
  createOrderFulfillmentWorkflow.runAsStep({ input: fulfillmentInput })

  const shiftLink = transform({ input, orderId }, ({ input, orderId }) => [
    { [POS_MODULE]: { pos_shift_id: input.shift_id }, [Modules.ORDER]: { order_id: orderId } },
  ])
  createRemoteLinkStep(shiftLink).config({ name: "link-pos-shift-order" })
  releaseLockStep({ key: lockKey })

  const result = transform({ orderId, total, input }, ({ orderId, total, input }) => ({
    order_id: orderId,
    total,
    payment_method: input.payment_method,
  }))
  return new WorkflowResponse(result)
})
