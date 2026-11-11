import {
  checkSpendingLimit,
  getOrderTotalInSpendWindow,
  getSpendWindow,
} from "../check-spending-limit";

// REVIEW_FIXES B1: the spending windows, in UTC, with `now` left alone.
describe("spending limit windows", () => {
  // A Wednesday.
  const now = new Date("2026-11-11T15:30:00.000Z");
  const window = (frequency: string) =>
    getSpendWindow({ spending_limit_reset_frequency: frequency as "daily" }, now);

  it("starts each window at the right UTC moment and ends it now", () => {
    expect(window("daily").start.toISOString()).toEqual("2026-11-11T00:00:00.000Z");
    expect(window("weekly").start.toISOString()).toEqual("2026-11-08T00:00:00.000Z");
    expect(window("monthly").start.toISOString()).toEqual("2026-11-01T00:00:00.000Z");
    expect(window("yearly").start.toISOString()).toEqual("2026-01-01T00:00:00.000Z");
    expect(window("never").start.getTime()).toEqual(0);
    expect(getSpendWindow(null, now).start.getTime()).toEqual(0);
    for (const frequency of ["daily", "weekly", "monthly", "yearly", "never"]) {
      expect(window(frequency).end.toISOString()).toEqual(now.toISOString());
    }
    // The caller's date is not moved.
    expect(now.toISOString()).toEqual("2026-11-11T15:30:00.000Z");
  });

  it("a week that starts in the month before", () => {
    const start = getSpendWindow(
      { spending_limit_reset_frequency: "weekly" },
      new Date("2026-12-02T08:00:00.000Z")
    ).start;
    expect(start.toISOString()).toEqual("2026-11-29T00:00:00.000Z");
  });

  it("a daily limit counts the orders placed earlier today", () => {
    const orders = [
      { created_at: "2026-11-11T09:00:00.000Z", total: 100 },
      { created_at: "2026-11-10T23:59:59.000Z", total: 500 },
    ];
    expect(getOrderTotalInSpendWindow(orders, window("daily"))).toEqual(100);
    expect(getOrderTotalInSpendWindow(orders, window("weekly"))).toEqual(600);

    const today = new Date();
    const customer = {
      employee: {
        spending_limit: 150,
        company: { spending_limit_reset_frequency: "daily" as const },
      },
      orders: [{ created_at: today.toISOString(), total: 100 }],
    };
    // 100 already spent today + 100 now is over the limit of 150.
    expect(checkSpendingLimit({ total: 100 }, customer)).toBe(true);
    expect(checkSpendingLimit({ total: 50 }, customer)).toBe(false);
  });
});
