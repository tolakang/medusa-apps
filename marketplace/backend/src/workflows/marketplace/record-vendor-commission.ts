import { randomUUID } from "node:crypto"
import {
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"
import {
  commissionAmount,
  commissionBase,
  commissionRateFor,
  PAYOUTS_LOCK,
  vendorPayoutAmount,
} from "../../lib/vendor-commission"

// One commission per vendor child order: what the marketplace keeps and what
// the vendor is owed (TASKS P6-06, F-078). An order that already has one, or
// has no vendor (a parent order), is skipped, so running it again is safe;
// the unique order_id is the last guard.
const recordVendorCommissionsStep = createStep(
  "record-vendor-commissions",
  async (input: { order_ids: string[] }, { container }) => {
    const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    if (!input.order_ids.length) {
      return new StepResponse([] as string[], [] as string[])
    }
    const existing = new Set(
      (await marketplace.listVendorCommissions({ order_id: input.order_ids })).map(
        (c) => c.order_id
      )
    )
    const todo = input.order_ids.filter((id) => !existing.has(id))
    if (!todo.length) {
      return new StepResponse([] as string[], [] as string[])
    }
    const { data: orders } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: [
        "id",
        "total",
        "item_total",
        "item_tax_total",
        "currency_code",
        "vendor.id",
        "vendor.commission_rate",
      ],
      filters: { id: todo },
    })
    const rows = orders
      .filter((o) => o.vendor?.id)
      .map((o) => {
        const base = commissionBase(o)
        const rate = commissionRateFor(o.vendor!)
        const amount = commissionAmount(base, rate)
        return {
          vendor_id: o.vendor!.id,
          order_id: o.id,
          order_total: o.total,
          base,
          rate,
          amount,
          payout_amount: vendorPayoutAmount(o.total, amount),
          currency_code: o.currency_code,
        }
      })
    const created = rows.length ? await marketplace.createVendorCommissions(rows) : []
    const ids = created.map((c) => c.id)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) {
      await container
        .resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
        .deleteVendorCommissions(ids)
    }
  }
)

// record-vendor-commission (BUILD_PLAN §6.6, TASKS P6-06): run by
// create-vendor-orders for the child orders it makes.
export const recordVendorCommissionsWorkflow = createWorkflow(
  "record-vendor-commission",
  function (input: { order_ids: string[] }) {
    return new WorkflowResponse(recordVendorCommissionsStep(input))
  }
)

// An order cancel cancels its commission while it isn't in a payout yet
// (pending). An approved or paid one is left alone (the payout already
// counts it) and reported, as Reseller does with paid commissions.
type CancelResult = { action: "none" | "kept" | "cancelled"; status?: string }

export const cancelVendorCommissionStep = createStep(
  "cancel-vendor-commission",
  async (orderId: string, { container }) => {
    const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    const [commission] = await marketplace.listVendorCommissions({ order_id: orderId })
    if (!commission) {
      return new StepResponse<CancelResult, string | null>({ action: "none" }, null)
    }
    if (commission.status !== "pending") {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(
          `Order ${orderId} was cancelled, but its vendor commission ${commission.id} is ${commission.status} (payout ${commission.payout_id}); settle it with the vendor by hand.`
        )
      return new StepResponse<CancelResult, string | null>(
        { action: "kept", status: commission.status },
        null
      )
    }
    await marketplace.updateVendorCommissions({ id: commission.id, status: "cancelled" })
    return new StepResponse<CancelResult, string | null>({ action: "cancelled" }, commission.id)
  },
  async (id, { container }) => {
    if (id) {
      await container
        .resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
        .updateVendorCommissions({ id, status: "pending" })
    }
  }
)

export const cancelVendorCommissionWorkflow = createWorkflow(
  "cancel-vendor-commission",
  function (input: { order_id: string }) {
    // Waits for a payout run, so a commission it is approving can't be
    // cancelled under it (review 2, S6).
    const ownerId = transform(input, () => `vendor-commission-cancel:${randomUUID()}`)
    acquireLockStep({ key: PAYOUTS_LOCK, ownerId, timeout: 60, ttl: 30 })
    const result = cancelVendorCommissionStep(input.order_id)
    releaseLockStep({ key: PAYOUTS_LOCK, ownerId })
    return new WorkflowResponse(result)
  }
)
