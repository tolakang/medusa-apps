import { MathBN, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep, useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

// Shift workflows (BUILD_PLAN §6.2, TASKS P2-04): open-shift (one open shift
// per register) and close-shift (expected cash from cash payments, variance).

// Contract with pos-checkout (P2-05): a POS cash payment's payment session is
// created with metadata.pos_payment_method = "cash" (CreatePaymentSessionDTO
// metadata is stored as given). Not payment.data: the payment module saves the
// provider's authorize result there, and the system provider returns {}
// (@medusajs/payment dist/providers/system.js). Card and QR payments carry
// another value, so they never count as cash, whichever provider records them.
export const POS_PAYMENT_METHOD_KEY = "pos_payment_method"
export const POS_CASH = "cash"

export const SHIFT_ALREADY_OPEN_MESSAGE = "This register already has an open shift. Close it first."

type OpenShiftInput = {
  register_id: string
  cashier_id: string
  opening_cash: number
  // Defaults to the store's default currency; must be a store currency.
  currency_code?: string
  notes?: string
}

const validateOpenPosShiftStep = createStep(
  "validate-open-pos-shift",
  async (input: OpenShiftInput, { container }) => {
    const pos: PosModuleService = container.resolve(POS_MODULE)
    const [register] = await pos.listPosRegisters({ id: input.register_id })
    if (!register) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Register ${input.register_id} was not found.`)
    }
    if (!register.is_active) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This register is not active.")
    }
    if (!(input.opening_cash >= 0)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Opening cash can't be negative.")
    }
    const [open] = await pos.listPosShifts({ register_id: input.register_id, status: "open" })
    if (open) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, SHIFT_ALREADY_OPEN_MESSAGE)
    }

    const [store] = await container
      .resolve(Modules.STORE)
      .listStores({}, { relations: ["supported_currencies"] })
    const currencies = store?.supported_currencies ?? []
    const currency_code = (
      input.currency_code ?? currencies.find((c) => c.is_default)?.currency_code ?? ""
    ).toLowerCase()
    if (!currencies.some((c) => c.currency_code === currency_code)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The shift currency must be one of the store's currencies (${currencies.map((c) => c.currency_code).join(", ")}).`
      )
    }
    return new StepResponse({ currency_code })
  }
)

const createPosShiftStep = createStep(
  "create-pos-shift",
  async (input: OpenShiftInput & { currency_code: string }, { container }) => {
    const pos: PosModuleService = container.resolve(POS_MODULE)
    try {
      const shift = await pos.createPosShifts({
        register_id: input.register_id,
        opened_by: input.cashier_id,
        opened_at: new Date(),
        currency_code: input.currency_code,
        opening_cash: input.opening_cash,
        notes: input.notes ?? null,
      })
      return new StepResponse(shift, shift.id)
    } catch (e) {
      // The partial unique index (one open shift per register, P2-01) refused
      // a second open shift that passed the check at the same moment.
      const [open] = await pos.listPosShifts({ register_id: input.register_id, status: "open" })
      if (open) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, SHIFT_ALREADY_OPEN_MESSAGE)
      }
      throw e
    }
  },
  async (shiftId: string | undefined, { container }) => {
    if (!shiftId) {
      return
    }
    await container.resolve<PosModuleService>(POS_MODULE).deletePosShifts(shiftId)
  }
)

export const openPosShiftWorkflow = createWorkflow(
  "open-pos-shift",
  function (input: OpenShiftInput) {
    const lockKey = transform({ input }, ({ input }) => `pos-register:${input.register_id}`)
    acquireLockStep({ key: lockKey, timeout: 5, ttl: 30 })
    const { currency_code } = validateOpenPosShiftStep(input)
    const shiftInput = transform({ input, currency_code }, ({ input, currency_code }) => ({
      ...input,
      currency_code,
    }))
    const shift = createPosShiftStep(shiftInput)
    releaseLockStep({ key: lockKey })
    return new WorkflowResponse(shift)
  }
)

type CloseShiftInput = {
  shift_id: string
  cashier_id: string
  counted_cash: number
  notes?: string
}

const getOpenPosShiftStep = createStep(
  "get-open-pos-shift",
  async (input: CloseShiftInput, { container }) => {
    const pos: PosModuleService = container.resolve(POS_MODULE)
    const [shift] = await pos.listPosShifts({ id: input.shift_id })
    if (!shift) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Shift ${input.shift_id} was not found.`)
    }
    if (shift.status !== "open") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This shift is already closed.")
    }
    if (!(input.counted_cash >= 0)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Counted cash can't be negative.")
    }
    return new StepResponse({
      id: shift.id,
      currency_code: shift.currency_code,
      opening_cash: shift.opening_cash,
    })
  }
)

type ShiftPayment = {
  currency_code?: string | null
  payment_session?: { metadata?: Record<string, unknown> | null } | null
  canceled_at?: string | Date | null
  captures?: ({ amount?: unknown } | null)[] | null
  refunds?: ({ amount?: unknown } | null)[] | null
}

// Opening cash + cash taken on the shift's orders (captured minus refunded),
// in the shift's currency. Canceled payments count nothing.
export function computeExpectedCash(
  openingCash: unknown,
  currencyCode: string,
  payments: (ShiftPayment | null | undefined)[]
): number {
  let total = MathBN.convert(openingCash as number)
  for (const p of payments) {
    if (!p || p.canceled_at || p.currency_code !== currencyCode) {
      continue
    }
    if (p.payment_session?.metadata?.[POS_PAYMENT_METHOD_KEY] !== POS_CASH) {
      continue
    }
    for (const c of p.captures ?? []) {
      total = MathBN.add(total, (c?.amount ?? 0) as number)
    }
    for (const r of p.refunds ?? []) {
      total = MathBN.sub(total, (r?.amount ?? 0) as number)
    }
  }
  return total.toNumber()
}

const closePosShiftStep = createStep(
  "close-pos-shift",
  async (
    input: CloseShiftInput & { expected_cash: number },
    { container }
  ) => {
    const pos: PosModuleService = container.resolve(POS_MODULE)
    const shift = await pos.updatePosShifts({
      id: input.shift_id,
      status: "closed",
      closed_by: input.cashier_id,
      closed_at: new Date(),
      counted_cash: input.counted_cash,
      expected_cash: input.expected_cash,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    return new StepResponse(shift, input.shift_id)
  },
  async (shiftId: string | undefined, { container }) => {
    if (!shiftId) {
      return
    }
    await container.resolve<PosModuleService>(POS_MODULE).updatePosShifts({
      id: shiftId,
      status: "open",
      closed_by: null,
      closed_at: null,
      counted_cash: null,
      expected_cash: null,
    })
  }
)

export const closePosShiftWorkflow = createWorkflow(
  "close-pos-shift",
  function (input: CloseShiftInput) {
    const lockKey = transform({ input }, ({ input }) => `pos-shift:${input.shift_id}`)
    acquireLockStep({ key: lockKey, timeout: 5, ttl: 30 })
    const open = getOpenPosShiftStep(input)
    const { data: shifts } = useQueryGraphStep({
      entity: "pos_shift",
      fields: [
        "id",
        "orders.id",
        "orders.payment_collections.payments.currency_code",
        "orders.payment_collections.payments.payment_session.metadata",
        "orders.payment_collections.payments.canceled_at",
        "orders.payment_collections.payments.captures.amount",
        "orders.payment_collections.payments.refunds.amount",
      ],
      filters: { id: input.shift_id },
    })
    const closeInput = transform({ input, open, shifts }, ({ input, open, shifts }) => {
      const payments = (shifts[0]?.orders ?? []).flatMap((o) =>
        (o?.payment_collections ?? []).flatMap((pc) => pc?.payments ?? [])
      ) as ShiftPayment[]
      return {
        ...input,
        expected_cash: computeExpectedCash(open.opening_cash, open.currency_code, payments),
      }
    })
    const shift = closePosShiftStep(closeInput)
    releaseLockStep({ key: lockKey })
    const result = transform({ shift, closeInput }, ({ shift, closeInput }) => ({
      shift,
      // Variance = counted - expected: negative means cash is missing.
      variance: MathBN.sub(closeInput.counted_cash, closeInput.expected_cash).toNumber(),
    }))
    return new WorkflowResponse(result)
  }
)
