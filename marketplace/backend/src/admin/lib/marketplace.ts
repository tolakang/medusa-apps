// Small helpers for the marketplace admin pages (TASKS P6-07).

export const errorText = (e: unknown) =>
  (e as { message?: string })?.message ?? "Something went wrong."

/** "12.50 USD" (amounts are in the currency's main unit, as Medusa stores them). */
export const money = (amount: unknown, currency?: string) =>
  `${Number(amount ?? 0).toFixed(2)} ${(currency ?? "").toUpperCase()}`.trim()

/** The admin's own page for a record (the dashboard is served under /app). */
export const adminLink = (path: string) => `/app${path}`

export const STATUS_COLOR: Record<string, "green" | "orange" | "red" | "grey" | "blue"> = {
  active: "green",
  published: "green",
  paid: "green",
  pending: "orange",
  proposed: "orange",
  draft: "grey",
  approved: "blue",
  suspended: "red",
  rejected: "red",
  cancelled: "red",
  canceled: "red",
}
