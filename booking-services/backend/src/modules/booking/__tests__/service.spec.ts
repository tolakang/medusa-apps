import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { BOOKING_MODULE } from ".."
import { Booking } from "../models/booking"
import { BookingResource } from "../models/booking-resource"
import { BookingSchedule } from "../models/booking-schedule"
import BookingModuleService from "../service"

jest.setTimeout(60 * 1000)

// TASKS P3-01: module `booking` with booking_resource, booking_schedule and
// booking (BUILD_PLAN §6.3).
moduleIntegrationTestRunner<BookingModuleService>({
  moduleName: BOOKING_MODULE,
  moduleModels: [BookingResource, BookingSchedule, Booking],
  resolve: "./src/modules/booking",
  testSuite: ({ service }) => {
    type ResourceType = "staff" | "room" | "equipment" | "venue"
    const resource = (
      overrides: { name?: string; type?: ResourceType; capacity?: number } = {}
    ) =>
      service.createBookingResources({
        name: "Sophea",
        type: "staff",
        timezone: "Asia/Phnom_Penh",
        ...overrides,
      })

    const at = (iso: string) => new Date(iso)

    describe("booking_resource", () => {
      it("stores a resource with the plan's fields and defaults", async () => {
        const created = await resource()

        expect(created.id).toMatch(/^bres_/)
        expect(created).toEqual(
          expect.objectContaining({
            name: "Sophea",
            type: "staff",
            capacity: 1,
            timezone: "Asia/Phnom_Penh",
            is_active: true,
          })
        )
      })

      it("accepts every resource type and a larger capacity", async () => {
        for (const type of ["staff", "room", "equipment", "venue"] as const) {
          const created = await resource({ name: `R-${type}`, type, capacity: 12 })
          expect(created).toEqual(expect.objectContaining({ type, capacity: 12 }))
        }
      })

      it("refuses an unknown type", async () => {
        await expect(resource({ type: "robot" as ResourceType })).rejects.toThrow()
      })

      it("refuses a capacity below 1", async () => {
        await expect(resource({ capacity: 0 })).rejects.toThrow(/booking_resource_capacity_positive/)
        await expect(resource({ capacity: -2 })).rejects.toThrow(/booking_resource_capacity_positive/)
      })
    })

    describe("booking_schedule", () => {
      it("stores weekly hours, including split hours on one day", async () => {
        const res = await resource()
        const rows = await service.createBookingSchedules([
          { resource_id: res.id, weekday: 1, start_time: "09:00", end_time: "12:00" },
          { resource_id: res.id, weekday: 1, start_time: "13:00", end_time: "17:30" },
          { resource_id: res.id, weekday: 0, start_time: "00:00", end_time: "23:59" },
        ])

        expect(rows).toHaveLength(3)
        expect(rows[0].id).toMatch(/^bsch_/)

        const withHours = await service.retrieveBookingResource(res.id, {
          relations: ["schedules"],
        })
        expect(withHours.schedules.map((s) => `${s.weekday} ${s.start_time}-${s.end_time}`).sort())
          .toEqual(["0 00:00-23:59", "1 09:00-12:00", "1 13:00-17:30"])
      })

      it("refuses a weekday outside 0-6", async () => {
        const res = await resource()
        for (const weekday of [-1, 7]) {
          await expect(
            service.createBookingSchedules({
              resource_id: res.id,
              weekday,
              start_time: "09:00",
              end_time: "10:00",
            })
          ).rejects.toThrow(/booking_schedule_weekday_range/)
        }
      })

      it("refuses times that are not zero-padded HH:MM", async () => {
        const res = await resource()
        // Each pair sorts start < end as text, so only the format check can
        // refuse it ("9:00" vs "10:00" would trip start-before-end first).
        for (const [start_time, end_time] of [
          ["08:00", "9:30"],
          ["09:00", "24:00"],
          ["09:60", "10:00"],
          ["09:00:00", "10:00"],
          ["09:00", "ten"],
        ]) {
          await expect(
            service.createBookingSchedules({ resource_id: res.id, weekday: 2, start_time, end_time })
          ).rejects.toThrow(/booking_schedule_time_format/)
        }
      })

      it("refuses a range that ends at or before its start", async () => {
        const res = await resource()
        for (const [start_time, end_time] of [
          ["10:00", "10:00"],
          ["17:00", "09:00"],
        ]) {
          await expect(
            service.createBookingSchedules({ resource_id: res.id, weekday: 3, start_time, end_time })
          ).rejects.toThrow(/booking_schedule_start_before_end/)
        }
      })
    })

    describe("booking", () => {
      it("stores a hold with the plan's fields; status defaults to pending", async () => {
        const res = await resource()
        const booking = await service.createBookings({
          resource_id: res.id,
          starts_at: at("2026-11-10T02:00:00Z"),
          ends_at: at("2026-11-10T03:00:00Z"),
          hold_expires_at: at("2026-11-04T10:15:00Z"),
          customer_id: "cus_1",
          cart_id: "cart_1",
          line_item_id: "cali_1",
          notes: "First visit",
        })

        expect(booking.id).toMatch(/^book_/)
        expect(booking).toEqual(
          expect.objectContaining({
            status: "pending",
            customer_id: "cus_1",
            cart_id: "cart_1",
            line_item_id: "cali_1",
            notes: "First visit",
          })
        )
        expect(new Date(booking.starts_at).toISOString()).toEqual("2026-11-10T02:00:00.000Z")
        expect(new Date(booking.ends_at).toISOString()).toEqual("2026-11-10T03:00:00.000Z")
        expect(new Date(booking.hold_expires_at!).toISOString()).toEqual("2026-11-04T10:15:00.000Z")
      })

      it("allows a walk-in booking without customer, cart or hold", async () => {
        const res = await resource()
        const booking = await service.createBookings({
          resource_id: res.id,
          starts_at: at("2026-11-10T04:00:00Z"),
          ends_at: at("2026-11-10T04:30:00Z"),
          status: "confirmed",
        })

        expect(booking).toEqual(
          expect.objectContaining({
            status: "confirmed",
            hold_expires_at: null,
            customer_id: null,
            cart_id: null,
            line_item_id: null,
          })
        )
      })

      it("moves through every status of the plan", async () => {
        const res = await resource()
        const booking = await service.createBookings({
          resource_id: res.id,
          starts_at: at("2026-11-11T02:00:00Z"),
          ends_at: at("2026-11-11T03:00:00Z"),
        })

        for (const status of ["confirmed", "completed", "no_show", "cancelled", "expired"] as const) {
          const updated = await service.updateBookings({ id: booking.id, status })
          expect(updated.status).toEqual(status)
        }
        await expect(
          service.updateBookings({ id: booking.id, status: "lost" as "expired" })
        ).rejects.toThrow()
      })

      it("refuses a booking that ends at or before its start", async () => {
        const res = await resource()
        for (const [starts, ends] of [
          ["2026-11-12T03:00:00Z", "2026-11-12T03:00:00Z"],
          ["2026-11-12T03:00:00Z", "2026-11-12T02:00:00Z"],
        ]) {
          await expect(
            service.createBookings({ resource_id: res.id, starts_at: at(starts), ends_at: at(ends) })
          ).rejects.toThrow(/booking_ends_after_start/)
        }
      })

      it("finds the bookings that overlap a time window of one resource", async () => {
        const res = await resource()
        const other = await resource({ name: "Room B", type: "room" })
        const make = (resource_id: string, starts: string, ends: string) =>
          service.createBookings({ resource_id, starts_at: at(starts), ends_at: at(ends) })

        const before = await make(res.id, "2026-11-13T01:00:00Z", "2026-11-13T02:00:00Z")
        const overlapsStart = await make(res.id, "2026-11-13T01:30:00Z", "2026-11-13T02:30:00Z")
        const inside = await make(res.id, "2026-11-13T02:15:00Z", "2026-11-13T02:45:00Z")
        const after = await make(res.id, "2026-11-13T03:00:00Z", "2026-11-13T04:00:00Z")
        await make(other.id, "2026-11-13T02:00:00Z", "2026-11-13T03:00:00Z")

        // Window 02:00-03:00: starts before the window ends, ends after it starts.
        const found = await service.listBookings({
          resource_id: res.id,
          starts_at: { $lt: at("2026-11-13T03:00:00Z") },
          ends_at: { $gt: at("2026-11-13T02:00:00Z") },
        })

        expect(found.map((b) => b.id).sort()).toEqual([overlapsStart.id, inside.id].sort())
        expect(found.map((b) => b.id)).not.toContain(before.id)
        expect(found.map((b) => b.id)).not.toContain(after.id)
      })
    })

    it("soft-deleting a resource removes its weekly hours and keeps its bookings", async () => {
      const res = await resource()
      const [hours] = await service.createBookingSchedules([
        { resource_id: res.id, weekday: 4, start_time: "09:00", end_time: "17:00" },
      ])
      const booking = await service.createBookings({
        resource_id: res.id,
        starts_at: at("2026-11-14T02:00:00Z"),
        ends_at: at("2026-11-14T03:00:00Z"),
        status: "completed",
      })

      await service.softDeleteBookingResources(res.id)

      expect(await service.listBookingResources({ id: res.id })).toHaveLength(0)
      expect(await service.listBookingSchedules({ id: hours.id })).toHaveLength(0)
      expect(await service.listBookings({ id: booking.id })).toHaveLength(1)
    })
  },
})
