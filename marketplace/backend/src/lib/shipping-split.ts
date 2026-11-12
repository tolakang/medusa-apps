import { MathBN } from "@medusajs/framework/utils"

// How the parent order's shipping is shared between vendors (owner
// 2026-11-12: "Split across vendors"; TASKS F-076). Each vendor's child order
// gets the parent's shipping amount times its share of the order's items
// (unit price × quantity, before discounts). When every item belongs to a
// vendor, the last vendor gets what rounding left, so the children add up to
// the parent exactly; otherwise the marketplace's own items keep their share
// on the parent.
export type ItemValue = { unit_price: unknown; quantity: unknown }

export const itemsValue = (items: ItemValue[]) =>
  items.reduce(
    (sum, i) => MathBN.add(sum, MathBN.mult(i.unit_price as any, i.quantity as any)),
    MathBN.convert(0)
  )

const round = (value: ReturnType<typeof MathBN.convert>, decimals: number) =>
  MathBN.convert(value.toNumber().toFixed(decimals))

// `amount` split by `vendorValues` out of `orderValue`, in the currency's
// main unit rounded to `decimals`.
export function splitShipping(
  amount: unknown,
  vendorValues: ReturnType<typeof MathBN.convert>[],
  orderValue: ReturnType<typeof MathBN.convert>,
  decimals = 2
): number[] {
  const total = MathBN.convert(amount as any)
  if (MathBN.lte(orderValue, 0) || MathBN.lte(total, 0)) {
    return vendorValues.map(() => 0)
  }
  const shares = vendorValues.map((v) => round(MathBN.div(MathBN.mult(total, v), orderValue), decimals))
  const vendorsHaveAll = MathBN.eq(
    vendorValues.reduce((s, v) => MathBN.add(s, v), MathBN.convert(0)),
    orderValue
  )
  if (vendorsHaveAll && shares.length) {
    const others = shares
      .slice(0, -1)
      .reduce((s, v) => MathBN.add(s, v), MathBN.convert(0))
    shares[shares.length - 1] = MathBN.sub(total, others)
  }
  return shares.map((s) => Number(s.toNumber().toFixed(decimals)))
}
