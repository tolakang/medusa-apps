import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows";
import seedInitialData from "../../src/scripts/seed-initial-data";
import { setupB2bCatalog } from "../../src/scripts/seed-b2b";
import { adminHeaders, createAdminUser } from "../utils/admin";

jest.setTimeout(240 * 1000);

// P4-04 (plan §6.4): add-to-cart needs an approved company and the minimum
// order quantity; checkout needs the employee's spending limit (over the
// company's reset window, past orders included) and, on net terms, the
// company's credit limit (unpaid orders included).
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("B2B cart rules (TASKS P4-04)", () => {
      let key: string;
      let regionId: string;
      let productId: string;
      let variantId: string;
      let emailCount = 0;

      const store = (token?: string) => ({
        headers: {
          "x-publishable-api-key": key,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      // Resolves to the response whatever its status.
      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        );

      const register = async () => {
        const email = `buyer${++emailCount}@b2b.test`;
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
                "x-publishable-api-key": key,
              },
            }
          )
        ).data;
        const token = (
          await api.post("/auth/customer/emailpass", { email, password: "password" })
        ).data.token;
        return { customer, token };
      };

      const companyWith = async (fields: Record<string, unknown> = {}) => {
        const {
          data: {
            companies: [company],
          },
        } = await api.post(
          "/admin/companies",
          { name: "Acme Wholesale", email: "acme@b2b.test", currency_code: "eur" },
          adminHeaders
        );
        if (Object.keys(fields).length) {
          await api.post(`/admin/companies/${company.id}`, fields, adminHeaders);
        }
        return company;
      };

      const employeeOf = async (
        companyId: string,
        employee: Record<string, unknown> = {}
      ) => {
        const buyer = await register();
        await api.post(
          `/admin/companies/${companyId}/employees`,
          { customer_id: buyer.customer.id, ...employee },
          adminHeaders
        );
        return buyer;
      };

      const cartWith = (token: string | undefined, quantity: number) =>
        call(
          api.post(
            "/store/carts",
            {
              region_id: regionId,
              email: "orders@b2b.test",
              shipping_address: {
                first_name: "A",
                last_name: "Buyer",
                address_1: "1 Trade St",
                city: "Berlin",
                country_code: "de",
                postal_code: "10115",
              },
              items: [{ variant_id: variantId, quantity }],
            },
            store(token)
          )
        );

      // Shipping, payment (system provider: authorized, not captured) and
      // completion. Returns the order, or the refusal message.
      const checkout = async (cartId: string, token: string) => {
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cartId}`, store(token));
        await api.post(
          `/store/carts/${cartId}/shipping-methods`,
          { option_id: shipping_options[0].id },
          store(token)
        );
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cartId }, store(token));
        await api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          store(token)
        );
        const res = await call(api.post(`/store/carts/${cartId}/complete`, {}, store(token)));
        if (res.status === 200 && res.data.type === "order") {
          return { order: res.data.order, refused: null as string | null };
        }
        return {
          order: null,
          refused: String(res.data?.error?.message ?? res.data?.message ?? res.status),
        };
      };

      const cartTotal = async (token: string, quantity: number) => {
        const res = await cartWith(token, quantity);
        expect(res.status).toEqual(200);
        const { data } = await api.post(
          `/store/carts/${res.data.cart.id}/shipping-methods`,
          {
            option_id: (
              await api.get(
                `/store/shipping-options?cart_id=${res.data.cart.id}`,
                store(token)
              )
            ).data.shipping_options[0].id,
          },
          store(token)
        );
        return { cartId: res.data.cart.id as string, total: data.cart.total as number };
      };

      beforeEach(async () => {
        const container = getContainer();
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        await createAdminUser(adminHeaders, container);
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        });
        await createDefaultsWorkflow(container).run();
        await seedInitialData({ container });
        ({ publishableKey: key } = await setupB2bCatalog(container));

        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"] });
        regionId = region.id;
        const { data } = await api.get(
          "/store/products?fields=id,variants.id&limit=1&order=handle",
          store()
        );
        productId = data.products[0].id;
        variantId = data.products[0].variants[0].id;
      });

      it("only employees of an approved company put items in a cart", async () => {
        // A guest may still open an empty cart.
        const empty = await call(
          api.post("/store/carts", { region_id: regionId }, store())
        );
        expect(empty.status).toEqual(200);
        const add = await call(
          api.post(
            `/store/carts/${empty.data.cart.id}/line-items`,
            { variant_id: variantId, quantity: 1 },
            store()
          )
        );
        expect(add.status).toEqual(400);
        expect(add.data.message).toContain("Sign in with a company account");

        const loner = await register();
        const noCompany = await cartWith(loner.token, 1);
        expect(noCompany.status).toEqual(400);
        expect(noCompany.data.message).toContain("not part of a company");

        const company = await companyWith({ status: "pending" });
        const buyer = await employeeOf(company.id);
        const pending = await cartWith(buyer.token, 1);
        expect(pending.status).toEqual(400);
        expect(pending.data.message).toContain("waiting for approval");

        await api.post(`/admin/companies/${company.id}`, { status: "suspended" }, adminHeaders);
        expect((await cartWith(buyer.token, 1)).data.message).toContain("suspended");

        await api.post(`/admin/companies/${company.id}`, { status: "approved" }, adminHeaders);
        expect((await cartWith(buyer.token, 1)).status).toEqual(200);
      });

      it("a company suspended after the items went in can't check out", async () => {
        const company = await companyWith();
        const buyer = await employeeOf(company.id);
        const res = await cartWith(buyer.token, 1);
        expect(res.status).toEqual(200);

        await api.post(`/admin/companies/${company.id}`, { status: "suspended" }, adminHeaders);
        const { order, refused } = await checkout(res.data.cart.id, buyer.token);
        expect(order).toBeNull();
        expect(refused).toContain("suspended");
      });

      it("each line reaches its minimum order quantity (variant first, then product)", async () => {
        const company = await companyWith();
        const buyer = await employeeOf(company.id);

        await api.post(
          `/admin/products/${productId}`,
          { metadata: { min_order_quantity: 6 } },
          adminHeaders
        );
        const below = await cartWith(buyer.token, 5);
        expect(below.status).toEqual(400);
        expect(below.data.message).toContain("minimum order quantity of 6");

        await api.post(
          `/admin/products/${productId}/variants/${variantId}`,
          { metadata: { min_order_quantity: 3 } },
          adminHeaders
        );
        const res = await cartWith(buyer.token, 3);
        expect(res.status).toEqual(200);
        const cart = res.data.cart;
        const lineId = cart.items[0].id;

        // Adding to the line counts the quantity it will have.
        const more = await call(
          api.post(
            `/store/carts/${cart.id}/line-items`,
            { variant_id: variantId, quantity: 1 },
            store(buyer.token)
          )
        );
        expect(more.status).toEqual(200);

        const lower = await call(
          api.post(
            `/store/carts/${cart.id}/line-items/${lineId}`,
            { quantity: 2 },
            store(buyer.token)
          )
        );
        expect(lower.status).toEqual(400);
        expect(lower.data.message).toContain("minimum order quantity of 3");

        const removed = await call(
          api.post(
            `/store/carts/${cart.id}/line-items/${lineId}`,
            { quantity: 0 },
            store(buyer.token)
          )
        );
        expect(removed.status).toEqual(200);
      });

      it("the spending limit counts the employee's past orders in the window", async () => {
        // The company resets spending monthly (the default).
        const company = await companyWith();
        const probe = await employeeOf(company.id);
        const { total } = await cartTotal(probe.token, 1);

        const buyer = await employeeOf(company.id, {
          spending_limit: Math.floor(total * 1.5),
        });
        const first = await cartWith(buyer.token, 1);
        expect((await checkout(first.data.cart.id, buyer.token)).order).not.toBeNull();

        // On its own the second cart is under the limit; with the first
        // order it is over (the starter only compared the cart).
        const second = await cartWith(buyer.token, 1);
        const { order, refused } = await checkout(second.data.cart.id, buyer.token);
        expect(order).toBeNull();
        expect(refused).toContain("exceeds spending limit");
      });

      it("net terms: unpaid orders count against the credit limit until captured", async () => {
        const probeCompany = await companyWith();
        const probe = await employeeOf(probeCompany.id);
        const { total } = await cartTotal(probe.token, 1);
        const limit = Math.floor(total * 1.5);

        const company = await companyWith({ payment_terms: "net_30", credit_limit: limit });
        const buyer = await employeeOf(company.id);
        const colleague = await employeeOf(company.id);

        const first = await cartWith(buyer.token, 1);
        const placed = await checkout(first.data.cart.id, buyer.token);
        expect(placed.order).not.toBeNull();

        // A colleague's order counts too: the debt is the company's.
        const second = await cartWith(colleague.token, 1);
        const refused = await checkout(second.data.cart.id, colleague.token);
        expect(refused.order).toBeNull();
        expect(refused.refused).toContain("credit limit");

        // The invoice is paid: capture the first order's payment.
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        const {
          data: [paid],
        } = await query.graph({
          entity: "order",
          fields: ["payment_collections.payments.id"],
          filters: { id: placed.order.id },
        });
        const paymentId = paid.payment_collections?.[0]?.payments?.[0]?.id;
        await api.post(`/admin/payments/${paymentId}/capture`, {}, adminHeaders);

        const third = await cartWith(colleague.token, 1);
        expect((await checkout(third.data.cart.id, colleague.token)).order).not.toBeNull();
      });

      it("prepaid companies and net-terms companies without a limit aren't credit-checked", async () => {
        for (const fields of [
          { payment_terms: "prepaid", credit_limit: 1 },
          { payment_terms: "net_60", credit_limit: null },
        ]) {
          const company = await companyWith(fields);
          const buyer = await employeeOf(company.id);
          const res = await cartWith(buyer.token, 1);
          expect((await checkout(res.data.cart.id, buyer.token)).order).not.toBeNull();
        }
      });
    });
  },
});
