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
  createOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
  createRemoteLinkStep,
  releaseLockStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { POS_PAYMENT_METHOD_KEY } from "./pos-shift"

// pos-checkout (BUILD_PLAN §6.2, TASKS P2-05), as in Medusa's POS recipe: the
// sale is a draft order in the register's sales channel (createOrderWorkflow
// with status draft, as the admin draft-order route does), promotions through
// promo_codes, converted to an order (convertDraftOrderWorkflow), paid in full
// and linked to the cashier's open shift.

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
      fields: ["id", "is_active", "sales_channel.id"],
      filters: { id: shift.register_id },
    })
    if (!register?.is_active) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This register is not active.")
    }
    const salesChannelId = register.sales_channel?.id
    if (!salesChannelId) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This register has no sales channel. Set it up in the admin.")
    }

    // Prices and taxes come from the store's default region (Cambodia, seed).
    const [store] = await container.resolve(Modules.STORE).listStores({})
    if (!store?.default_region_id) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The store has no default region.")
    }

    return new StepResponse({
      register_id: register.id as string,
      sales_channel_id: salesChannelId as string,
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

export const posCheckoutWorkflow = createWorkflow("pos-checkout", function (input: PosCheckoutInput) {
  // Same key as close-pos-shift: a sale and the shift close never interleave.
  const lockKey = transform({ input }, ({ input }) => `pos-shift:${input.shift_id}`)
  acquireLockStep({ key: lockKey, timeout: 10, ttl: 120 })
  const context = validatePosCheckoutStep(input)

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

  const { data: orders } = useQueryGraphStep({
    entity: "order",
    fields: ["id", "total", "currency_code"],
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
