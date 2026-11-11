import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { adminHeaders } from "../utils/admin";
import { call, setupB2b } from "../utils/b2b";

jest.setTimeout(240 * 1000);

// docs/REVIEW_FIXES.md batch 3: the bulk add route (B12) and the quote
// routes (B13) don't hand out other people's records.
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("wholesale data exposure (REVIEW_FIXES batch 3)", () => {
      let b2b: Awaited<ReturnType<typeof setupB2b>>;

      beforeEach(async () => {
        b2b = await setupB2b(api, getContainer());
      });

      it("B12: only the cart's buyer adds in bulk, and the answer names no people", async () => {
        const company = await b2b.company();
        const buyer = await b2b.employee(company.id);
        const colleague = await b2b.employee(company.id);
        const { data } = await b2b.cart(buyer.token, 1);
        const cartId = data.cart.id;
        const bulk = (token: string | undefined, query = "") =>
          call(
            api.post(
              `/store/carts/${cartId}/line-items/bulk${query}`,
              { line_items: [{ variant_id: b2b.variantId, quantity: 1 }] },
              b2b.store(token)
            )
          );

        expect((await bulk(undefined)).status).toEqual(401);
        expect((await bulk(colleague.token)).status).toEqual(404);

        const own = await bulk(
          buyer.token,
          "?fields=*customer.employee.company.employees.customer"
        );
        expect(own.status).toEqual(200);
        expect(own.data.cart.customer).toBeUndefined();
        expect(own.data.cart.company).toBeUndefined();
        expect(JSON.stringify(own.data)).not.toContain(colleague.customer.email);
        expect(own.data.cart.items[0].quantity).toEqual(2);

        expect(
          (
            await call(
              api.post(
                `/store/carts/${cartId}/line-items/bulk`,
                { line_items: [{ variant_id: b2b.variantId, quantity: 0 }] },
                b2b.store(buyer.token)
              )
            )
          ).status
        ).toEqual(400);
      });

      it("B13: a quote shows the buyer's own details and only the name of the shop's staff", async () => {
        const company = await b2b.company();
        const buyer = await b2b.employee(company.id);
        const colleague = await b2b.employee(company.id);
        const { data } = await b2b.cart(buyer.token, 1);
        const {
          data: { quote },
        } = await api.post("/store/quotes", { cart_id: data.cart.id }, b2b.store(buyer.token));
        await api.post(
          `/admin/quotes/${quote.id}/messages`,
          { text: "Here is your price." },
          adminHeaders
        );

        const asked = await api.get(
          `/store/quotes/${quote.id}?fields=*messages.admin,*customer.employee.company.employees.customer,*customer.orders`,
          b2b.store(buyer.token)
        );
        const body = JSON.stringify(asked.data);
        expect(asked.data.quote.customer.email).toEqual(buyer.customer.email);
        expect(asked.data.quote.customer.employee.company.employees).toBeUndefined();
        expect(asked.data.quote.customer.orders).toBeUndefined();
        expect(body).not.toContain(colleague.customer.email);
        const asking = asked.data.quote.messages.find(
          (m: { admin_id?: string | null }) => m.admin_id
        );
        expect(asking?.admin?.email).toBeUndefined();

        // By default the message names the staff member, nothing more.
        const plain = await api.get(`/store/quotes/${quote.id}`, b2b.store(buyer.token));
        const message = plain.data.quote.messages.find(
          (m: { admin_id?: string | null }) => m.admin_id
        );
        expect(Object.keys(message.admin).sort()).toEqual(["first_name", "id", "last_name"]);
        expect(message.admin.first_name).toEqual("Admin");
      });
    });
  },
});
