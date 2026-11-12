import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { adminHeaders } from "../utils/admin";
import { call, setupB2b } from "../utils/b2b";

jest.setTimeout(240 * 1000);

// Review 2, S3: an accepted quote becomes an order that reserves its stock
// (core convertDraftOrderWorkflow), so the shop can't sell the same units
// again and staff can fulfil it. Before, only the merchant's changed items
// had a reservation.
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("accepted quotes reserve stock (review 2, S3)", () => {
      it("an unchanged quote's order reserves every item and can be fulfilled", async () => {
        const container = getContainer();
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        const b2b = await setupB2b(api, container);

        // A product whose stock is tracked, in the B2B channel, with 10 in stock.
        const {
          data: [channel],
        } = await query.graph({
          entity: "api_key",
          fields: ["sales_channels.id", "sales_channels.stock_locations.id"],
          filters: { token: b2b.key },
        });
        const salesChannel = channel.sales_channels![0]!;
        const locationId = salesChannel.stock_locations![0]!.id;
        // The shipping options' profile, so the order item can be shipped.
        const {
          data: [option],
        } = await query.graph({ entity: "shipping_option", fields: ["shipping_profile_id"] });
        const profile = { id: option.shipping_profile_id };
        const {
          data: { product },
        } = await api.post(
          "/admin/products",
          {
            title: "Tracked crate",
            status: "published",
            shipping_profile_id: profile.id,
            sales_channels: [{ id: salesChannel.id }],
            options: [{ title: "Size", values: ["One"] }],
            variants: [
              {
                title: "One",
                manage_inventory: true,
                options: { Size: "One" },
                prices: [{ currency_code: "eur", amount: 20 }],
              },
            ],
          },
          adminHeaders
        );
        const {
          data: [variant],
        } = await query.graph({
          entity: "variant",
          fields: ["id", "inventory_items.inventory_item_id"],
          filters: { id: product.variants[0].id },
        });
        const inventoryItemId = variant.inventory_items![0]!.inventory_item_id;
        await api.post(
          `/admin/inventory-items/${inventoryItemId}/location-levels`,
          { location_id: locationId, stocked_quantity: 10 },
          adminHeaders
        );

        const company = await b2b.company();
        const buyer = await b2b.employee(company.id);
        const {
          data: { cart },
        } = await api.post(
          "/store/carts",
          {
            region_id: b2b.regionId,
            email: "orders@b2b.test",
            items: [{ variant_id: variant.id, quantity: 3 }],
          },
          b2b.store(buyer.token)
        );

        const {
          data: { quote },
        } = await api.post("/store/quotes", { cart_id: cart.id }, b2b.store(buyer.token));
        await api.post(`/admin/quotes/${quote.id}/send`, {}, adminHeaders);
        const accepted = await call(
          api.post(`/store/quotes/${quote.id}/accept`, {}, b2b.store(buyer.token))
        );
        expect(accepted.status).toEqual(200);

        const {
          data: [order],
        } = await query.graph({
          entity: "order",
          fields: ["id", "status", "is_draft_order", "items.id", "items.quantity"],
          filters: { id: quote.draft_order_id },
        });
        expect(order.status).toEqual("pending");
        expect(order.is_draft_order).toBe(false);

        const inventory = container.resolve(Modules.INVENTORY);
        const reservations = await inventory.listReservationItems({
          line_item_id: order.items!.map((item) => item!.id),
        });
        expect(reservations).toHaveLength(1);
        expect(Number(reservations[0].quantity)).toEqual(3);
        expect(reservations[0].location_id).toEqual(locationId);

        // Staff can fulfil it now (core refuses an item without reservation).
        const fulfilled = await call(
          api.post(
            `/admin/orders/${order.id}/fulfillments`,
            {
              location_id: locationId,
              items: order.items!.map((item) => ({ id: item!.id, quantity: item!.quantity })),
            },
            adminHeaders
          )
        );
        expect(fulfilled.status).toEqual(200);
      });
    });
  },
});
