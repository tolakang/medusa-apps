import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { BOOKING_MODULE } from ".."
import { Booking } from "../models/booking"
import { BookingResource } from "../models/booking-resource"
import { BookingSchedule } from "../models/booking-schedule"
import BookingModuleService from "../service"

jest.setTimeout(60 * 1000)

// TASKS P3-03: isSlotAvailable / checkSlot (overlap + capacity; pending holds
// count only until they expire) and createHold (BUILD_PLAN §6.3), plus the
// P3-14 race: two customers can't hold the same last place.
const at = (iso: string) => new Date(iso)
const NOW = at("2026-11-01T00:00:00Z")
// Monday 2026-11-09 in Phnom Penh (UTC+7): 09:00 local = 02:00 UTC.
const MON_09 = at("2026-11-09T02:00:00Z")
const MON_10 = at("2026-11-09T03:00:00Z")
const MON_11 = at("2026-11-09T04:00:00Z")

moduleIntegrationTestRunner<BookingModuleService>({
  moduleName: BOOKING_MODULE,
  moduleModels: [BookingResource, BookingSchedule, Booking],
  moduleOptions: { holdMinutes: 20 },
  resolve: "./src/modules/booking",
  testSuite: ({ service }) => {
    // Open Monday 09:00-12:00 and 13:00-17:00 local.
    const openResource = async (capacity = 1, is_active = true) => {
      const resource = await service.createBookingResources({
        name: `R-${Math.random()}`,
        type: capacity > 1 ? "room" : "staff",
        capacity,
        is_active,
        timezone: "Asia/Phnom_Penh",
      })
      await service.createBookingSchedules([
        { resource_id: resource.id, weekday: 1, start_time: "09:00", end_time: "12:00" },
        { resource_id: resource.id, weekday: 1, start_time: "13:00", end_time: "17:00" },
      ])
      return resource
    }
    const check = (resource_id: string, starts_at: Date, ends_at: Date, extra = {}) =>
      service.checkSlot({ resource_id, starts_at, ends_at, now: NOW, ...extra })
    const book = (resource_id: string, starts_at: Date, ends_at: Date, extra = {}) =>
      service.createBookings({ resource_id, starts_at, ends_at, status: "confirmed", ...extra })

    describe("checkSlot / isSlotAvailable", () => {
      it("offers a free slot inside the opening hours", async () => {
        const r = await openResource()
        expect(await check(r.id, MON_09, MON_10)).toEqual({
          available: true,
          capacity: 1,
          remaining: 1,
        })
        expect(
          await service.isSlotAvailable({ resource_id: r.id, starts_at: MON_09, ends_at: MON_10, now: NOW })
        ).toBe(true)
      })

      it("refuses with a reason: bad range, past, unknown or inactive resource, outside hours", async () => {
        const r = await openResource()
        const off = await openResource(1, false)

        expect(await check(r.id, MON_10, MON_09)).toMatchObject({ available: false, reason: "invalid_range" })
        expect(await check(r.id, MON_09, MON_10, { now: at("2026-11-09T02:30:00Z") })).toMatchObject({
          available: false,
          reason: "in_past",
        })
        expect(await check("bres_missing", MON_09, MON_10)).toMatchObject({
          available: false,
          reason: "resource_not_found",
        })
        expect(await check(off.id, MON_09, MON_10)).toMatchObject({
          available: false,
          reason: "resource_inactive",
        })
        // 12:30-13:30 local crosses the lunch gap; Tuesday is closed.
        expect(
          await check(r.id, at("2026-11-09T05:30:00Z"), at("2026-11-09T06:30:00Z"))
        ).toMatchObject({ available: false, reason: "outside_hours" })
        expect(
          await check(r.id, at("2026-11-10T02:00:00Z"), at("2026-11-10T03:00:00Z"))
        ).toMatchObject({ available: false, reason: "outside_hours" })
      })

      it("is full when a confirmed booking overlaps, but not when one only touches", async () => {
        const r = await openResource()
        await book(r.id, MON_09, MON_10)

        expect(await check(r.id, at("2026-11-09T02:30:00Z"), at("2026-11-09T03:30:00Z"))).toMatchObject({
          available: false,
          reason: "full",
          remaining: 0,
        })
        expect(await check(r.id, MON_10, MON_11)).toMatchObject({ available: true })
      })

      it("counts a pending hold only until it expires; cancelled and expired never count", async () => {
        const r = await openResource()
        await book(r.id, MON_09, MON_10, { status: "pending", hold_expires_at: at("2026-11-01T00:10:00Z") })

        expect(await check(r.id, MON_09, MON_10)).toMatchObject({ available: false, reason: "full" })
        // 15 minutes later the hold has run out, even before a job marks it expired.
        expect(await check(r.id, MON_09, MON_10, { now: at("2026-11-01T00:15:00Z") })).toMatchObject({
          available: true,
        })

        const r2 = await openResource()
        await book(r2.id, MON_09, MON_10, { status: "cancelled" })
        await book(r2.id, MON_09, MON_10, { status: "expired" })
        expect(await check(r2.id, MON_09, MON_10)).toMatchObject({ available: true, remaining: 1 })
      })

      it("ignores the asking cart's own hold, so a retried checkout stays valid", async () => {
        const r = await openResource()
        await book(r.id, MON_09, MON_10, {
          status: "pending",
          hold_expires_at: at("2026-11-01T00:20:00Z"),
          cart_id: "cart_mine",
        })

        expect(await check(r.id, MON_09, MON_10, { ignore_cart_id: "cart_mine" })).toMatchObject({
          available: true,
        })
        expect(await check(r.id, MON_09, MON_10, { ignore_cart_id: "cart_other" })).toMatchObject({
          available: false,
          reason: "full",
        })
      })

      it("uses the peak overlap against capacity, not the number of bookings", async () => {
        const room = await openResource(2)
        // 09-10 and 10-11 never overlap each other: 09-11 still has one place.
        await book(room.id, MON_09, MON_10)
        await book(room.id, MON_10, MON_11)
        expect(await check(room.id, MON_09, MON_11)).toMatchObject({ available: true, remaining: 1 })

        // A second booking at 09-10 makes 09:00-10:00 full for a capacity of 2.
        await book(room.id, MON_09, MON_10)
        expect(await check(room.id, MON_09, MON_11)).toMatchObject({ available: false, reason: "full" })
        expect(await check(room.id, MON_10, MON_11)).toMatchObject({ available: true, remaining: 1 })
      })
    })

    describe("createHold", () => {
      it("creates a pending booking that holds the slot for the configured minutes", async () => {
        const r = await openResource()
        const hold = await service.createHold({
          resource_id: r.id,
          starts_at: MON_09,
          ends_at: MON_10,
          cart_id: "cart_1",
          customer_id: "cus_1",
          now: NOW,
        })

        expect(hold.id).toMatch(/^book_/)
        expect(hold).toMatchObject({ status: "pending", cart_id: "cart_1", customer_id: "cus_1" })
        // moduleOptions.holdMinutes = 20 for this suite.
        expect(new Date(hold.hold_expires_at!).toISOString()).toEqual("2026-11-01T00:20:00.000Z")
        expect(service.holdMinutes).toEqual(20)
        expect(await check(r.id, MON_09, MON_10)).toMatchObject({ available: false, reason: "full" })
      })

      it("refuses a hold when the slot isn't available, with a clear message", async () => {
        const r = await openResource()
        await book(r.id, MON_09, MON_10)

        await expect(
          service.createHold({ resource_id: r.id, starts_at: MON_09, ends_at: MON_10, now: NOW })
        ).rejects.toThrow("This time is no longer available.")
        await expect(
          service.createHold({
            resource_id: r.id,
            starts_at: at("2026-11-10T02:00:00Z"),
            ends_at: at("2026-11-10T03:00:00Z"),
            now: NOW,
          })
        ).rejects.toThrow("This time is outside the opening hours.")
        expect(await service.listBookings({ resource_id: r.id })).toHaveLength(1)
      })

      it("P3-06: extendCartHolds renews a cart's holds for holdMinutes from now", async () => {
        const r = await openResource()
        const hold = await service.createHold({
          resource_id: r.id,
          starts_at: MON_09,
          ends_at: MON_10,
          cart_id: "cart_pay",
          now: NOW,
        })
        await book(r.id, MON_10, MON_11, { status: "pending", hold_expires_at: at("2026-11-01T00:05:00Z"), cart_id: "cart_other" })

        const later = at("2026-11-01T00:12:00Z")
        const extended = await service.extendCartHolds({ cart_id: "cart_pay", now: later })

        expect(extended).toEqual([
          {
            id: hold.id,
            previous_hold_expires_at: new Date("2026-11-01T00:20:00Z"),
            hold_expires_at: new Date("2026-11-01T00:32:00Z"),
          },
        ])
        const [after] = await service.listBookings({ id: hold.id })
        expect(new Date(after.hold_expires_at!).toISOString()).toEqual("2026-11-01T00:32:00.000Z")
        // Another cart's hold isn't touched.
        const [other] = await service.listBookings({ cart_id: "cart_other" })
        expect(new Date(other.hold_expires_at!).toISOString()).toEqual("2026-11-01T00:05:00.000Z")
      })

      it("P3-06: renews a hold that ran out only while its slot is still free", async () => {
        const r = await openResource()
        await book(r.id, MON_09, MON_10, { status: "pending", hold_expires_at: at("2026-11-01T00:05:00Z"), cart_id: "cart_slow" })
        await book(r.id, MON_10, MON_11, { status: "pending", hold_expires_at: at("2026-11-01T00:05:00Z"), cart_id: "cart_slow" })
        // Someone else took 10:00-11:00 after cart_slow's hold ran out.
        await book(r.id, MON_10, MON_11, { cart_id: "cart_fast" })

        const extended = await service.extendCartHolds({ cart_id: "cart_slow", now: at("2026-11-01T00:30:00Z") })

        expect(extended).toHaveLength(1)
        const rows = await service.listBookings({ cart_id: "cart_slow" }, { order: { starts_at: "ASC" } })
        expect(rows.map((b) => new Date(b.hold_expires_at!).toISOString())).toEqual([
          "2026-11-01T00:50:00.000Z", // 09:00-10:00 renewed
          "2026-11-01T00:05:00.000Z", // 10:00-11:00 taken: left as it was
        ])
      })

      it("P3-06: leaves confirmed bookings and holds already long enough alone", async () => {
        const r = await openResource(2)
        await book(r.id, MON_09, MON_10, { cart_id: "cart_done" })
        await book(r.id, MON_10, MON_11, { status: "pending", hold_expires_at: at("2026-11-01T02:00:00Z"), cart_id: "cart_done" })

        expect(await service.extendCartHolds({ cart_id: "cart_done", now: NOW })).toEqual([])
      })

      it("P3-09: releaseExpiredHolds marks only pending holds past their expiry as expired", async () => {
        const r = await openResource(3)
        const gone = await book(r.id, MON_09, MON_10, { status: "pending", hold_expires_at: at("2026-11-01T00:05:00Z") })
        const fresh = await book(r.id, MON_09, MON_10, { status: "pending", hold_expires_at: at("2026-11-01T00:30:00Z") })
        const paid = await book(r.id, MON_09, MON_10)

        const released = await service.releaseExpiredHolds({ now: at("2026-11-01T00:10:00Z") })

        expect(released.map((b) => b.id)).toEqual([gone.id])
        const status = async (id: string) => (await service.listBookings({ id }))[0].status
        expect(await status(gone.id)).toEqual("expired")
        expect(await status(fresh.id)).toEqual("pending")
        expect(await status(paid.id)).toEqual("confirmed")
        // Running again finds nothing new.
        expect(await service.releaseExpiredHolds({ now: at("2026-11-01T00:10:00Z") })).toEqual([])
      })

      it("P3-09: releaseExpiredHolds stops at the limit", async () => {
        const r = await openResource(5)
        for (let n = 0; n < 4; n++) {
          await book(r.id, MON_09, MON_10, { status: "pending", hold_expires_at: at(`2026-11-01T00:0${n}:00Z`) })
        }
        expect(await service.releaseExpiredHolds({ now: at("2026-11-01T01:00:00Z"), limit: 3 })).toHaveLength(3)
        expect(await service.releaseExpiredHolds({ now: at("2026-11-01T01:00:00Z"), limit: 3 })).toHaveLength(1)
      })

      it("P3-10: listFreeSlots offers the free hours of a day, per resource", async () => {
        const a = await openResource()
        const b = await openResource(2)
        const off = await openResource(1, false)
        // a: 10:00-11:00 taken; b: one of two places taken at 09:00-10:00.
        await book(a.id, MON_10, MON_11)
        await book(b.id, MON_09, MON_10)

        const slots = await service.listFreeSlots({
          resource_ids: [a.id, b.id, off.id],
          date: "2026-11-09",
          duration_minutes: 60,
          now: NOW,
        })
        const of = (id: string) =>
          slots.filter((s) => s.resource_id === id).map((s) => `${s.starts_at.toISOString().slice(11, 16)}/${s.remaining}`)

        // Hours 09-12 and 13-17 local = 02-05 and 06-10 UTC.
        expect(of(a.id)).toEqual(["02:00/1", "04:00/1", "06:00/1", "07:00/1", "08:00/1", "09:00/1"])
        expect(of(b.id)).toEqual(["02:00/1", "03:00/2", "04:00/2", "06:00/2", "07:00/2", "08:00/2", "09:00/2"])
        expect(of(off.id)).toEqual([])
      })

      it("P3-10: listFreeSlots leaves out slots that already started and counts expired holds as free", async () => {
        const a = await openResource()
        await book(a.id, MON_11, at("2026-11-09T05:00:00Z"), { status: "pending", hold_expires_at: at("2026-11-09T03:10:00Z") })

        const slots = await service.listFreeSlots({
          resource_ids: [a.id],
          date: "2026-11-09",
          duration_minutes: 60,
          now: at("2026-11-09T03:30:00Z"), // 10:30 local
        })
        // 09:00 and 10:00 have started; the 11:00 hold has run out.
        expect(slots[0].starts_at.toISOString()).toEqual("2026-11-09T04:00:00.000Z")
      })

      it("P3-14: of many holds at once for the last place, exactly one succeeds", async () => {
        const r = await openResource()
        const results = await Promise.allSettled(
          Array.from({ length: 8 }, (_, n) =>
            service.createHold({
              resource_id: r.id,
              starts_at: MON_09,
              ends_at: MON_10,
              cart_id: `cart_${n}`,
              now: NOW,
            })
          )
        )

        expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1)
        expect(await service.listBookings({ resource_id: r.id })).toHaveLength(1)
      })

      it("P3-14: with capacity 3, exactly three of many holds at once succeed", async () => {
        const room = await openResource(3)
        const results = await Promise.allSettled(
          Array.from({ length: 8 }, (_, n) =>
            service.createHold({
              resource_id: room.id,
              starts_at: MON_09,
              ends_at: MON_10,
              cart_id: `cart_${n}`,
              now: NOW,
            })
          )
        )

        expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(3)
        expect(await service.listBookings({ resource_id: room.id })).toHaveLength(3)
      })
    })
  },
})
