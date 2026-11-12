import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import type MarketplaceModuleService from "../../src/modules/marketplace/service"
import {
  CHILD_ORDERS_KEY,
  PARENT_ORDER_KEY,
} from "../../src/workflows/marketplace/create-vendor-orders"

jest.setTimeout(240 * 1000)

// TASKS P6-05 (plan §6.6): POST /store/carts/:id/complete-vendor completes
// the cart into the parent order (payment) and makes one child order per
// vendor, linked to it; a retried call makes none (P6-12). Real checkouts
// through the Cambodia shop's setup and Medusa's system payment provider,
// as in checkout-acceptance.spec.ts.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("vendor orders (TASKS P6-05)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const marketplace = () =>
        getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

      beforeEach(async () => {
        const container = getContainer()
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })
        const {
          data: [key],
        } = await query().graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        })
        store = { headers: { "x-publishable-api-key": key.token } }
        const {
          data: [region],
        } = await query().graph({
          entity: "region",
          fields: ["id"],
          filters: { name: "Cambodia" },
        })
        regionId = region.id
      })

      // A vendor that owns the products with these handles.
      const vendorWith = async (handle: string, productHandles: string[]) => {
        const vendor = await marketplace().createVendors({
          handle,
          name: handle,
          email: `${handle}@vendor.test`,
          status: "active",
        })
        const { data: products } = await query().graph({
          entity: "product",
          fields: ["id"],
          filters: { handle: productHandles },
        })
        for (const p of products) {
          await getContainer()
            .resolve(ContainerRegistrationKeys.LINK)
            .create({
              [MARKETPLACE_MODULE]: { vendor_id: vendor.id },
              [Modules.PRODUCT]: { product_id: p.id },
            })
        }
        return vendor
      }

      const variantOf = async (productHandle: string) => {
        const { data } = await query().graph({
          entity: "product",
          fields: ["variants.id"],
          filters: { handle: productHandle },
        })
        return data[0].variants![0]!.id
      }

      // A cart ready to complete: items, Cambodian address, delivery and a
      // system-provider payment session.
      const readyCart = async (lines: { handle: string; quantity: number }[]) => {
        const {
          data: { cart },
        } = await api.post("/store/carts", { region_id: regionId }, store)
        for (const line of lines) {
          await api.post(
            `/store/carts/${cart.id}/line-items`,
            { variant_id: await variantOf(line.handle), quantity: line.quantity },
            store
          )
        }
        const address = {
          first_name: "Test",
          last_name: "Customer",
          address_1: "#111, St 310",
          province: "Phnom Penh",
          city: "Khan Chamkar Mon",
          postal_code: "120100",
          country_code: "kh",
          phone: "012 345 678",
        }
        await api.post(
          `/store/carts/${cart.id}`,
          { shipping_address: address, billing_address: address, email: "buyer@test.test" },
          store
        )
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cart.id}`, store)
        const delivery = shipping_options.find((o) => o.name === "Phnom Penh Delivery")
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: delivery.id }, store)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart.id }, store)
        await api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          store
        )
        return cart.id as string
      }

      const orderDetails = async (ids: string[]) => {
        const { data } = await query().graph({
          entity: "order",
          fields: [
            "id",
            "metadata",
            "email",
            "customer_id",
            "region_id",
            "sales_channel_id",
            "item_total",
            "shipping_address.city",
            "items.product_id",
            "items.quantity",
            "items.unit_price",
            "shipping_methods.amount",
            "vendor.id",
          ],
          filters: { id: ids },
        })
        return new Map(data.map((o) => [o.id, o]))
      }

      const orderCount = async () =>
        (await query().graph({ entity: "order", fields: ["id"] })).data.length

      it("a two-vendor cart makes the parent order and one child order per vendor", async () => {
        const dara = await vendorWith("dara", ["t-shirt"])
        const sok = await vendorWith("sok", ["sweatshirt"])
        const cartId = await readyCart([
          { handle: "t-shirt", quantity: 2 },
          { handle: "sweatshirt", quantity: 1 },
        ])

        const res = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        expect(res.data.type).toBe("order")
        // The storefront's redirect needs the country (P6-08).
        expect(res.data.order.shipping_address.country_code).toBe("kh")
        const parentId = res.data.order.id
        expect(res.data.vendor_orders).toHaveLength(2)
        expect(await orderCount()).toBe(3)

        const children = res.data.vendor_orders as { vendor_id: string; order_id: string }[]
        expect(children.map((c) => c.vendor_id).sort()).toEqual([dara.id, sok.id].sort())
        const orders = await orderDetails([parentId, ...children.map((c) => c.order_id)])
        const parent = orders.get(parentId)!
        // The parent is the customer's (payment) order, not a vendor's.
        expect(parent.vendor).toBeFalsy()
        expect(parent.metadata?.[CHILD_ORDERS_KEY]).toEqual(children.map((c) => c.order_id))

        const { data: products } = await query().graph({
          entity: "product",
          fields: ["id", "handle"],
          filters: { handle: ["t-shirt", "sweatshirt"] },
        })
        const productOf = Object.fromEntries(products.map((p) => [p.handle, p.id]))
        for (const child of children) {
          const order = orders.get(child.order_id)!
          expect(order.vendor?.id).toBe(child.vendor_id)
          expect(order.metadata?.[PARENT_ORDER_KEY]).toBe(parentId)
          expect(order.email).toBe(parent.email)
          // Not in the customer's own order list (P6-08).
          expect(order.customer_id ?? null).toBeNull()
          expect(order.region_id).toBe(parent.region_id)
          expect(order.sales_channel_id).toBe(parent.sales_channel_id)
          expect(order.shipping_address?.city).toBe("Khan Chamkar Mon")
          const expected = child.vendor_id === dara.id ? "t-shirt" : "sweatshirt"
          expect(order.items?.map((i) => i?.product_id)).toEqual([productOf[expected]])
          // Same price as on the parent.
          const parentItem = parent.items!.find((i) => i?.product_id === productOf[expected])!
          expect(Number(order.items![0]!.unit_price)).toBe(Number(parentItem.unit_price))
          expect(Number(order.items![0]!.quantity)).toBe(Number(parentItem.quantity))
        }
        // The children's items add up to the parent's.
        const childItems = children.reduce(
          (sum, c) => sum + Number(orders.get(c.order_id)!.item_total),
          0
        )
        expect(childItems).toBeCloseTo(Number(parent.item_total), 2)

        // Shipping is split by item value (owner: "Split across vendors",
        // F-076) and the children's shares add up to what the customer paid.
        const value = (o: any) =>
          o.items.reduce((s: number, i: any) => s + Number(i.unit_price) * Number(i.quantity), 0)
        const parentShipping = Number(parent.shipping_methods![0]!.amount)
        expect(parentShipping).toBeGreaterThan(0)
        let shippingSum = 0
        for (const child of children) {
          const order = orders.get(child.order_id)!
          const share = Number(order.shipping_methods![0]!.amount)
          shippingSum += share
          expect(share).toBeCloseTo((parentShipping * value(order)) / value(parent), 1)
        }
        expect(shippingSum).toBeCloseTo(parentShipping, 10)

        // Each vendor sees only its own order (vendor ↔ order link).
        const {
          data: [withOrders],
        } = await query().graph({
          entity: "vendor",
          fields: ["orders.id"],
          filters: { id: dara.id },
        })
        expect(withOrders.orders?.map((o) => o?.id)).toEqual([
          children.find((c) => c.vendor_id === dara.id)!.order_id,
        ])
      })

      it("one vendor still gets a child order; the marketplace's own items stay on the parent", async () => {
        const dara = await vendorWith("dara", ["t-shirt"])
        const cartId = await readyCart([
          { handle: "t-shirt", quantity: 1 },
          { handle: "shorts", quantity: 1 },
        ])
        const res = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        expect(res.data.vendor_orders).toEqual([
          expect.objectContaining({ vendor_id: dara.id }),
        ])
        const orders = await orderDetails([res.data.order.id, res.data.vendor_orders[0].order_id])
        const parent = orders.get(res.data.order.id)!
        const child = orders.get(res.data.vendor_orders[0].order_id)!
        expect(parent.items).toHaveLength(2)
        expect(child.items).toHaveLength(1)
        // The vendor's shipping share follows its share of the items; the
        // marketplace's own item keeps the rest on the parent.
        const value = (o: any) =>
          o.items.reduce((s: number, i: any) => s + Number(i.unit_price) * Number(i.quantity), 0)
        expect(Number(child.shipping_methods![0]!.amount)).toBeCloseTo(
          (Number(parent.shipping_methods![0]!.amount) * value(child)) / value(parent),
          2
        )
        expect(Number(child.shipping_methods![0]!.amount)).toBeLessThan(
          Number(parent.shipping_methods![0]!.amount)
        )
      })

      it("a cart without vendor products makes no child orders", async () => {
        const cartId = await readyCart([{ handle: "shorts", quantity: 1 }])
        const res = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        expect(res.data.type).toBe("order")
        expect(res.data.vendor_orders).toEqual([])
        expect(await orderCount()).toBe(1)
      })

      it("a retried call makes no duplicate child orders (P6-12)", async () => {
        await vendorWith("dara", ["t-shirt"])
        await vendorWith("sok", ["sweatshirt"])
        const cartId = await readyCart([
          { handle: "t-shirt", quantity: 1 },
          { handle: "sweatshirt", quantity: 1 },
        ])
        const first = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        const again = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        expect(again.data.order.id).toBe(first.data.order.id)
        expect(
          again.data.vendor_orders.map((c: { order_id: string }) => c.order_id).sort()
        ).toEqual(first.data.vendor_orders.map((c: { order_id: string }) => c.order_id).sort())
        expect(await orderCount()).toBe(3)
      })

      it("calls at the same time make one set of child orders", async () => {
        await vendorWith("dara", ["t-shirt"])
        await vendorWith("sok", ["sweatshirt"])
        const cartId = await readyCart([
          { handle: "t-shirt", quantity: 1 },
          { handle: "sweatshirt", quantity: 1 },
        ])
        const results = await Promise.allSettled(
          [1, 2, 3].map(() => api.post(`/store/carts/${cartId}/complete-vendor`, {}, store))
        )
        expect(results.some((r) => r.status === "fulfilled")).toBe(true)
        expect(await orderCount()).toBe(3)
        // A later call still answers with the same orders.
        const after = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        expect(after.data.vendor_orders).toHaveLength(2)
      })

      it("works when the order takes a variant's last units", async () => {
        await vendorWith("dara", ["t-shirt"])
        const variantId = await variantOf("t-shirt")
        const {
          data: [variant],
        } = await query().graph({
          entity: "product_variant",
          fields: ["inventory_items.inventory_item_id"],
          filters: { id: variantId },
        })
        const inventoryItemId = variant.inventory_items![0]!.inventory_item_id
        const inventory = getContainer().resolve(Modules.INVENTORY)
        const [level] = await inventory.listInventoryLevels({ inventory_item_id: inventoryItemId })
        await inventory.updateInventoryLevels([
          {
            inventory_item_id: inventoryItemId,
            location_id: level.location_id,
            stocked_quantity: 2,
          },
        ])
        const cartId = await readyCart([{ handle: "t-shirt", quantity: 2 }])
        const res = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        expect(res.data.vendor_orders).toHaveLength(1)
        // Stock is reserved once, and the reservation is now the child's, so
        // the vendor's fulfilment uses it.
        const [after] = await inventory.listInventoryLevels({ inventory_item_id: inventoryItemId })
        expect(Number(after.reserved_quantity)).toBe(2)
        const {
          data: [child],
        } = await query().graph({
          entity: "order",
          fields: ["items.id"],
          filters: { id: res.data.vendor_orders[0].order_id },
        })
        const reservations = await inventory.listReservationItems({
          inventory_item_id: inventoryItemId,
        })
        expect(reservations.map((r) => [r.line_item_id, Number(r.quantity)])).toEqual([
          [child.items![0]!.id, 2],
        ])
      })

      it("a failure while making child orders leaves none behind, and a retry works", async () => {
        await vendorWith("dara", ["t-shirt"])
        await vendorWith("sok", ["sweatshirt"])
        const cartId = await readyCart([
          { handle: "t-shirt", quantity: 1 },
          { handle: "sweatshirt", quantity: 1 },
        ])
        const inventory = getContainer().resolve(Modules.INVENTORY)
        // The second vendor's reservation move fails once.
        const original = inventory.createReservationItems.bind(inventory)
        let calls = 0
        const spy = jest
          .spyOn(inventory, "createReservationItems")
          .mockImplementation(async (...args: any[]) => {
            calls += 1
            if (calls === 2) {
              throw new Error("reservation store down")
            }
            return (original as any)(...args)
          })
        const failed = await api
          .post(`/store/carts/${cartId}/complete-vendor`, {}, store)
          .catch((e) => e.response)
        spy.mockRestore()
        expect(failed.status).toBeGreaterThanOrEqual(400)

        // Medusa undoes the cart completion too (the parent order goes), and
        // no order or reservation is left behind.
        const { data: orders } = await query().graph({
          entity: "order",
          fields: ["id", "metadata", "items.id"],
        })
        expect(orders).toEqual([])
        expect(await inventory.listReservationItems({})).toEqual([])

        // Retrying completes it with one child per vendor.
        const retried = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        expect(retried.data.vendor_orders).toHaveLength(2)
        const { data: after } = await query().graph({ entity: "order", fields: ["id"] })
        expect(after).toHaveLength(3)
      })

      it("a cart completed through Medusa's own route still gets its vendor orders (F-079)", async () => {
        // As when PayWay's webhook completes the cart before the customer
        // returns: the order.placed subscriber splits it.
        await vendorWith("dara", ["t-shirt"])
        await vendorWith("sok", ["sweatshirt"])
        const cartId = await readyCart([
          { handle: "t-shirt", quantity: 1 },
          { handle: "sweatshirt", quantity: 1 },
        ])
        const core = await api.post(`/store/carts/${cartId}/complete`, {}, store)
        expect(core.data.type).toBe("order")
        const parentId = core.data.order.id

        let children: string[] = []
        for (let i = 0; i < 40 && children.length < 2; i++) {
          await new Promise((r) => setTimeout(r, 250))
          const {
            data: [parent],
          } = await query().graph({ entity: "order", fields: ["metadata"], filters: { id: parentId } })
          children = (parent.metadata?.[CHILD_ORDERS_KEY] ?? []) as string[]
        }
        expect(children).toHaveLength(2)

        // The storefront's complete-vendor afterwards finds them: no second set.
        const later = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, store)
        expect(later.data.order.id).toBe(parentId)
        expect(later.data.vendor_orders.map((c: { order_id: string }) => c.order_id).sort()).toEqual(
          [...children].sort()
        )
        expect(await orderCount()).toBe(3)
      })

      it("answers 404 for an unknown cart", async () => {
        const res = await api
          .post(`/store/carts/cart_missing/complete-vendor`, {}, store)
          .catch((e) => e.response)
        expect(res.status).toBe(404)
      })
    })
  },
})
