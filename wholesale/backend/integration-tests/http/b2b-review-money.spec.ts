import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { adminHeaders } from "../utils/admin";
import { call, setupB2b } from "../utils/b2b";

jest.setTimeout(240 * 1000);

// docs/REVIEW_FIXES.md batch 2: the company's credit keeps counting an order
// after its employee leaves (B4, B5), a cancelled order isn't due (B3), and
// two checkouts of one company at the same moment can't both use the last
// of its credit (B6).
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("wholesale money rules (REVIEW_FIXES batch 2)", () => {
      let b2b: Awaited<ReturnType<typeof setupB2b>>;

      beforeEach(async () => {
        b2b = await setupB2b(api, getContainer());
      });

      const companyOf = async (orderId: string) => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        // The link is made by the order.placed subscriber, asynchronously.
        for (let i = 0; i < 40; i++) {
          const {
            data: [order],
          } = await query.graph({
            entity: "order",
            fields: ["id", "company.id"],
            filters: { id: orderId },
          });
          const id = (order as { company?: { id?: string } | null })?.company?.id;
          if (id) {
            return id;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return null;
      };

      const order = async (token: string) => {
        const { data } = await b2b.cart(token, 1);
        return b2b.checkout(data.cart.id, token);
      };

      it("B4, B5: a checkout is linked to the company, and still counts after its buyer leaves", async () => {
        const company = await b2b.company({ payment_terms: "net_30" });
        const leaver = await b2b.employee(company.id);
        const stayer = await b2b.employee(company.id);

        const first = await order(leaver.token);
        expect(first.order).toBeTruthy();
        expect(await companyOf(first.order.id)).toEqual(company.id);

        // Room for one and a half such orders.
        await api.post(
          `/admin/companies/${company.id}`,
          { credit_limit: Math.ceil(Number(first.order.total) * 1.5) },
          adminHeaders
        );

        const {
          data: { employees },
        } = await api.get("/store/companies/me/employees", b2b.store(leaver.token));
        const leaverRecord = employees.find(
          (employee: { customer: { id: string } }) =>
            employee.customer.id === leaver.customer.id
        );
        const removed = await call(
          api.delete(
            `/admin/companies/${company.id}/employees/${leaverRecord.id}`,
            adminHeaders
          )
        );
        expect(removed.status).toEqual(200);

        const second = await order(stayer.token);
        expect(second.order).toBeNull();
        expect(second.refused).toContain("credit limit");
      });

      it("B3: a cancelled order is listed as cancelled with nothing due", async () => {
        const company = await b2b.company({ payment_terms: "net_30" });
        const buyer = await b2b.employee(company.id);
        const placed = await order(buyer.token);
        expect(placed.order).toBeTruthy();

        const due = async () => {
          for (let i = 0; i < 40; i++) {
            const { data } = await api.get("/store/invoices", b2b.store(buyer.token));
            if (data.invoices.length) {
              return data.invoices[0];
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          return null;
        };
        expect(await due()).toEqual(
          expect.objectContaining({
            cancelled: false,
            amount_due: Number(placed.order.total),
          })
        );

        await api.post(`/admin/orders/${placed.order.id}/cancel`, {}, adminHeaders);
        expect(await due()).toEqual(
          expect.objectContaining({ cancelled: true, amount_due: 0 })
        );
      });

      it("B6: two checkouts at the same moment can't both use the last of the credit", async () => {
        const company = await b2b.company({ payment_terms: "net_30" });
        const one = await b2b.employee(company.id);
        const two = await b2b.employee(company.id);

        // Find the price of one unit, then leave room for exactly one more.
        const probe = await order(one.token);
        expect(probe.order).toBeTruthy();
        await api.post(
          `/admin/companies/${company.id}`,
          { credit_limit: Math.ceil(Number(probe.order.total) * 2.5) },
          adminHeaders
        );

        const carts = await Promise.all([b2b.cart(one.token, 1), b2b.cart(two.token, 1)]);
        const results = await Promise.all([
          b2b.checkout(carts[0].data.cart.id, one.token),
          b2b.checkout(carts[1].data.cart.id, two.token),
        ]);

        expect(results.filter((result) => result.order)).toHaveLength(1);
        expect(results.find((result) => !result.order)!.refused).toContain("credit limit");
      });
    });
  },
});
