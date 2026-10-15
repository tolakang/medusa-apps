import { computeExpectedCash } from "../pos-shift"

// TASKS P2-04: expected cash = opening cash + cash captured - cash refunded,
// in the shift's currency (BUILD_PLAN §6.2 close-shift).
const cash = (captures: number[], refunds: number[] = [], extra: Record<string, unknown> = {}) => ({
  currency_code: "usd",
  payment_session: { metadata: { pos_payment_method: "cash" } },
  captures: captures.map((amount) => ({ amount })),
  refunds: refunds.map((amount) => ({ amount })),
  ...extra,
})

describe("computeExpectedCash", () => {
  it("is the opening cash when nothing was sold", () => {
    expect(computeExpectedCash(50, "usd", [])).toEqual(50)
  })

  it("adds cash captures and subtracts cash refunds", () => {
    expect(computeExpectedCash(50, "usd", [cash([12.5]), cash([20], [5])])).toEqual(77.5)
  })

  it("ignores card and QR payments and payments without a POS method", () => {
    const card = cash([30], [], { payment_session: { metadata: { pos_payment_method: "card" } } })
    const noMethod = cash([30], [], { payment_session: { metadata: {} } })
    const noSession = cash([30], [], { payment_session: null })
    expect(computeExpectedCash(10, "usd", [card, noMethod, noSession])).toEqual(10)
  })

  it("ignores other currencies and canceled payments", () => {
    const khr = cash([40000], [], { currency_code: "khr" })
    const canceled = cash([15], [], { canceled_at: new Date() })
    expect(computeExpectedCash(0, "usd", [khr, canceled, null, undefined])).toEqual(0)
  })

  it("adds decimals without floating-point drift", () => {
    expect(computeExpectedCash(0.1, "usd", [cash([0.2])])).toEqual(0.3)
  })
})
