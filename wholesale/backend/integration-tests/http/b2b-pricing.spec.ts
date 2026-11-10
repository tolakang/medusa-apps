import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows";
import seedInitialData from "../../src/scripts/seed-initial-data";
import {
  B2B_PUBLISHABLE_KEY_TITLE,
  B2B_SALES_CHANNEL_NAME,
  setupB2bCatalog,
  setupDemoPriceTiers,
} from "../../src/scripts/seed-b2b";
import { adminHeaders, createAdminUser } from "../utils/admin";

jest.setTimeout(180 * 1000);

// P4-03 (plan §6.4): a B2B sales channel with its own publishable key, price
// lists per customer group (`customer.groups.id`) and quantity tiers
// (`min_quantity` / `max_quantity`). Gold pays 80% of the base price (75%
// from 10 units), Silver 90% (85%); see DEMO_PRICE_TIERS.
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("seed-b2b (TASKS P4-03)", () => {
      let b2bKey: string;
      let firstBootKey: string;
      let regionId: string;
      let groups: Record<string, string>;

      const storeHeaders = (key: string, token?: string) => ({
        headers: {
          "x-publishable-api-key": key,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const registerCustomer = async (email: string) => {
        const registerToken = (
          await api.post("/auth/customer/emailpass/register", {
            email,
            password: "password",
          })
        ).data.token;
        const { customer } = (
          await api.post(
            "/store/customers",
            { email },
            {
              headers: {
                Authorization: `Bearer ${registerToken}`,
                "x-publishable-api-key": b2bKey,
              },
            }
          )
        ).data;
        const token = (
          await api.post("/auth/customer/emailpass", {
            email,
            password: "password",
          })
        ).data.token;
        return { customer, token };
      };

      // The starter's path: the company joins a customer group, its
      // employees' customers join that group with it.
      const buyerOf = async (group: string, email: string) => {
        const buyer = await registerCustomer(email);
        const {
          data: {
            companies: [company],
          },
        } = await api.post(
          "/admin/companies",
          { name: `${group} Traders`, email, currency_code: "eur" },
          adminHeaders
        );
        await api.post(
          `/admin/companies/${company.id}/employees`,
          { customer_id: buyer.customer.id },
          adminHeaders
        );
        await api.post(
          `/admin/companies/${company.id}/customer-group`,
          { group_id: groups[group] },
          adminHeaders
        );
        return buyer;
      };

      const share = (amount: number, part: number) =>
        Math.round(amount * part * 100) / 100;

      const unitPrice = async (token?: string) => {
        const { data } = await api.get(
          `/store/products?region_id=${regionId}&fields=*variants.calculated_price&limit=1&order=handle`,
          storeHeaders(b2bKey, token)
        );
        return data.products[0].variants[0].calculated_price.calculated_amount;
      };

      beforeEach(async () => {
        const container = getContainer();
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        await createAdminUser(adminHeaders, container);
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        });
        await createDefaultsWorkflow(container).run();
        const {
          data: [key],
        } = await query.graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        });
        firstBootKey = key.token;
        await seedInitialData({ container });

        // Twice: the second run must change nothing.
        await setupB2bCatalog(container);
        ({ publishableKey: b2bKey } = await setupB2bCatalog(container));
        groups = await setupDemoPriceTiers(container);
        await setupDemoPriceTiers(container);

        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"] });
        regionId = region.id;
      });

      it("adds one B2B channel and key, and both keys still see every product", async () => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        const { data: channels } = await query.graph({
          entity: "sales_channel",
          fields: ["name"],
        });
        const { data: keys } = await query.graph({
          entity: "api_key",
          fields: ["title", "sales_channels.name"],
          filters: { type: "publishable" },
        });
        const { data: lists } = await query.graph({
          entity: "price_list",
          fields: ["title"],
        });
        expect(channels).toHaveLength(2);
        expect(keys).toHaveLength(2);
        expect(lists.map((list) => list.title).sort()).toEqual([
          "Gold prices",
          "Silver prices",
        ]);
        const b2b = keys.find((k) => k.title === B2B_PUBLISHABLE_KEY_TITLE);
        expect(b2b?.sales_channels?.map((c) => c?.name)).toEqual([
          B2B_SALES_CHANNEL_NAME,
        ]);

        for (const key of [b2bKey, firstBootKey]) {
          const res = await api.get("/store/products?fields=id", storeHeaders(key));
          expect(res.data.count).toEqual(8);
        }
      });

      it("a Gold company's buyer sees Gold prices, Silver sees Silver, a guest the base price", async () => {
        const gold = await buyerOf("Gold", "gold@buyer.test");
        const silver = await buyerOf("Silver", "silver@buyer.test");

        const base = await unitPrice();
        expect(base).toBeGreaterThan(0);
        expect(await unitPrice(gold.token)).toEqual(share(base, 0.8));
        expect(await unitPrice(silver.token)).toEqual(share(base, 0.9));
      });

      it("quantity tiers: from 10 units a Gold buyer pays the volume price in the cart", async () => {
        const gold = await buyerOf("Gold", "gold-cart@buyer.test");
        const { data } = await api.get(
          `/store/products?region_id=${regionId}&fields=variants.id&limit=1&order=handle`,
          storeHeaders(b2bKey, gold.token)
        );
        const variantId = data.products[0].variants[0].id;

        const {
          data: { cart },
        } = await api.post(
          "/store/carts",
          { region_id: regionId, items: [{ variant_id: variantId, quantity: 1 }] },
          storeHeaders(b2bKey, gold.token)
        );
        const base = await unitPrice();
        expect(cart.items[0].unit_price).toEqual(share(base, 0.8));

        const lineId = cart.items[0].id;
        const {
          data: { cart: updated },
        } = await api.post(
          `/store/carts/${cart.id}/line-items/${lineId}`,
          { quantity: 10 },
          storeHeaders(b2bKey, gold.token)
        );
        expect(updated.items[0].unit_price).toEqual(share(base, 0.75));
        expect(updated.items[0].quantity).toEqual(10);
      });
    });
  },
});
