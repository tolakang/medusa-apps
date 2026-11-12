import { randomUUID } from "node:crypto"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"
import { groupPayouts, PAYOUTS_LOCK } from "../../lib/vendor-commission"
import { childOrdersWithRefundedParent } from "./refund-review"


type CreatePayoutsInput = { cutoff: Date; period: string }
type Created = { payout_ids: string[]; commission_ids: string[] }

// Every pending commission recorded before the cutoff goes into one payout
// per vendor and currency for the period (TASKS P6-06), except one held for
// a refund to review (F-078). The flag isn't undone if a later step fails:
// it records a refund that is there either way. A vendor that
// already has that period's payout in that currency keeps its commissions
// pending for the next one (the unique index would refuse a second payout).
const createPayoutsStep = createStep(
  "create-vendor-payouts",
  async (input: CreatePayoutsInput, { container }) => {
    const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    const due = await marketplace.listVendorCommissions(
      { status: "pending", created_at: { $lt: input.cutoff } },
      { select: ["id", "order_id", "vendor_id", "currency_code", "payout_amount", "refund_review"] }
    )
    // F-078: hold a commission whose parent order has a refund, unless the
    // admin has settled it; flag it for the payout report.
    const refunded = await childOrdersWithRefundedParent(
      container,
      due.filter((c) => c.refund_review !== "settled").map((c) => c.order_id)
    )
    const held = due.filter((c) => c.refund_review !== "settled" && refunded.has(c.order_id))
    const toFlag = held.filter((c) => c.refund_review !== "to_review")
    if (toFlag.length) {
      await marketplace.updateVendorCommissions(
        toFlag.map((c) => ({ id: c.id, refund_review: "to_review" as const }))
      )
    }
    const pending = due.filter((c) => !held.includes(c))
    const lines = groupPayouts(pending)
    const existing = await marketplace.listVendorPayouts({ period: input.period })
    const taken = new Set(existing.map((p) => `${p.vendor_id}:${p.currency_code}`))
    const created: Created = { payout_ids: [], commission_ids: [] }
    const payouts: { id: string; vendor_id: string; currency_code: string; amount: number; count: number }[] = []
    try {
      for (const line of lines) {
        if (taken.has(`${line.vendor_id}:${line.currency_code}`)) {
          continue
        }
        const payout = await marketplace.createVendorPayouts({
          vendor_id: line.vendor_id,
          currency_code: line.currency_code,
          amount: line.amount,
          period: input.period,
        })
        created.payout_ids.push(payout.id)
        await marketplace.updateVendorCommissions(
          line.commission_ids.map((id) => ({ id, status: "approved" as const, payout_id: payout.id }))
        )
        created.commission_ids.push(...line.commission_ids)
        payouts.push({
          id: payout.id,
          vendor_id: line.vendor_id,
          currency_code: line.currency_code,
          amount: line.amount,
          count: line.commission_ids.length,
        })
      }
    } catch (e) {
      await undoPayouts(marketplace, created)
      throw e
    }
    return new StepResponse(payouts, created)
  },
  async (created, { container }) => {
    if (created) {
      await undoPayouts(container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE), created)
    }
  }
)

async function undoPayouts(marketplace: MarketplaceModuleService, created: Created) {
  if (created.commission_ids.length) {
    await marketplace.updateVendorCommissions(
      created.commission_ids.map((id) => ({ id, status: "pending" as const, payout_id: null }))
    )
  }
  if (created.payout_ids.length) {
    await marketplace.deleteVendorPayouts(created.payout_ids)
  }
}

// create-payouts (BUILD_PLAN §6.6, TASKS P6-06): run by the daily job on
// MARKETPLACE_PAYOUT_DAY for the month before. One run at a time.
export const createVendorPayoutsWorkflow = createWorkflow(
  "create-payouts",
  function (input: CreatePayoutsInput) {
    const ownerId = transform(input, () => `vendor-payouts:${randomUUID()}`)
    acquireLockStep({ key: PAYOUTS_LOCK, ownerId, timeout: 30, ttl: 120 })
    const payouts = createPayoutsStep(input)
    releaseLockStep({ key: PAYOUTS_LOCK, ownerId })
    return new WorkflowResponse(payouts)
  }
)

export const PAYOUT_NOT_PENDING_MESSAGE = "Only a pending payout can be marked paid."

// The admin paid the vendor outside Medusa: the payout and its commissions
// are marked paid with the transfer's reference.
const markPayoutPaidStep = createStep(
  "mark-vendor-payout-paid",
  async (input: { id: string; reference: string }, { container }) => {
    const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    const payout = await marketplace.retrieveVendorPayout(input.id)
    if (payout.status !== "pending") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PAYOUT_NOT_PENDING_MESSAGE)
    }
    const commissions = await marketplace.listVendorCommissions({ payout_id: payout.id })
    await marketplace.updateVendorPayouts({
      id: payout.id,
      status: "paid",
      paid_at: new Date(),
      reference: input.reference,
    })
    if (commissions.length) {
      await marketplace.updateVendorCommissions(
        commissions.map((c) => ({ id: c.id, status: "paid" as const }))
      )
    }
    return new StepResponse(payout.id, {
      id: payout.id,
      commission_ids: commissions.map((c) => c.id),
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    await marketplace.updateVendorPayouts({ id: previous.id, status: "pending", paid_at: null, reference: null })
    if (previous.commission_ids.length) {
      await marketplace.updateVendorCommissions(
        previous.commission_ids.map((id) => ({ id, status: "approved" as const }))
      )
    }
  }
)

export const markVendorPayoutPaidWorkflow = createWorkflow(
  "mark-vendor-payout-paid",
  function (input: { id: string; reference: string }) {
    const key = transform(input, (i) => `vendor-payout:${i.id}`)
    const ownerId = transform(input, () => `vendor-payout-paid:${randomUUID()}`)
    acquireLockStep({ key, ownerId, timeout: 30, ttl: 120 })
    const id = markPayoutPaidStep(input)
    releaseLockStep({ key, ownerId })
    return new WorkflowResponse(id)
  }
)
