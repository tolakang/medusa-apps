import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { adminHeaders } from "../utils/admin";
import { call, setupB2b } from "../utils/b2b";

jest.setTimeout(240 * 1000);

// P4-05 (plan §6.4: "approval flow for orders above a limit"; owner
// 2026-11-10: no threshold = every cart, a company admin skips the
// company-admin approval, quote acceptance runs the checkout rules).
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("B2B approvals and quotes (TASKS P4-05)", () => {
      let b2b: Awaited<ReturnType<typeof setupB2b>>;

      beforeEach(async () => {
        b2b = await setupB2b(api, getContainer());
      });

      const requestApproval = (cartId: string, token: string) =>
        call(api.post(`/store/carts/${cartId}/approvals`, {}, b2b.store(token)));
      const decide = (approvalId: string, token: string, status: string) =>
        call(
          api.post(
            `/store/approvals/${approvalId}`,
            { status },
            b2b.store(token)
          )
        );

      it("above the threshold an order needs approval; below it, none", async () => {
        const company = await b2b.company();
        const buyer = await b2b.employee(company.id);
        const small = await b2b.cart(buyer.token, 1);
        const threshold = small.data.cart.total * 2;
        await b2b.approvalSettings(company.id, {
          requires_admin_approval: true,
          approval_threshold: threshold,
        });

        expect((await b2b.checkout(small.data.cart.id, buyer.token)).order).not.toBeNull();

        const big = await b2b.cart(buyer.token, 3);
        const refused = await b2b.checkout(big.data.cart.id, buyer.token);
        expect(refused.order).toBeNull();
        expect(refused.refused).toContain("company admin's approval");
      });

      it("the company admin approves; the cart's items lock; then it checks out", async () => {
        const company = await b2b.company();
        await b2b.approvalSettings(company.id, { requires_admin_approval: true });
        const buyer = await b2b.employee(company.id);
        const admin = await b2b.employee(company.id, { is_admin: true });
        const colleague = await b2b.employee(company.id);

        const { data } = await b2b.cart(buyer.token, 1);
        const cartId = data.cart.id;

        // Only the cart's buyer asks.
        expect((await requestApproval(cartId, colleague.token)).status).toEqual(400);
        const asked = await requestApproval(cartId, buyer.token);
        expect(asked.status).toEqual(200);
        const approval = asked.data.approvals[0];
        expect(approval.type).toEqual("admin");

        const add = await call(
          api.post(
            `/store/carts/${cartId}/line-items`,
            { variant_id: b2b.variantId, quantity: 1 },
            b2b.store(buyer.token)
          )
        );
        expect(add.status).toEqual(400);
        expect(add.data.message).toContain("pending approval");

        // An admin of another company can't decide it, and gets the same
        // answer as for an approval that doesn't exist (REVIEW_FIXES B16).
        const other = await b2b.company();
        const otherAdmin = await b2b.employee(other.id, { is_admin: true });
        expect((await decide(approval.id, otherAdmin.token, "approved")).status).toEqual(404);
        expect((await decide("appr_missing", otherAdmin.token, "approved")).status).toEqual(404);
        // Only a decision, nothing else.
        expect((await decide(approval.id, admin.token, "pending")).status).toEqual(400);
        expect(
          (
            await call(
              api.post(
                `/store/approvals/${approval.id}`,
                { status: "approved", handled_by: "someone" },
                b2b.store(admin.token)
              )
            )
          ).status
        ).toEqual(400);

        expect((await decide(approval.id, admin.token, "approved")).status).toEqual(200);
        // A decided approval can't be decided again.
        expect((await decide(approval.id, admin.token, "rejected")).status).toEqual(400);

        const afterApproval = await call(
          api.post(
            `/store/carts/${cartId}/line-items`,
            { variant_id: b2b.variantId, quantity: 1 },
            b2b.store(buyer.token)
          )
        );
        expect(afterApproval.status).toEqual(400);
        expect(afterApproval.data.message).toContain("approved");

        expect((await b2b.checkout(cartId, buyer.token)).order).not.toBeNull();
      });

      it("a rejected cart can't check out", async () => {
        const company = await b2b.company();
        await b2b.approvalSettings(company.id, { requires_admin_approval: true });
        const buyer = await b2b.employee(company.id);
        const admin = await b2b.employee(company.id, { is_admin: true });
        const { data } = await b2b.cart(buyer.token, 1);
        const asked = await requestApproval(data.cart.id, buyer.token);
        await decide(asked.data.approvals[0].id, admin.token, "rejected");

        const { order, refused } = await b2b.checkout(data.cart.id, buyer.token);
        expect(order).toBeNull();
        expect(refused).toContain("rejected");
      });

      it("a company admin's own order skips the company-admin approval, not the sales manager's", async () => {
        const company = await b2b.company();
        await b2b.approvalSettings(company.id, { requires_admin_approval: true });
        const admin = await b2b.employee(company.id, { is_admin: true });

        const own = await b2b.cart(admin.token, 1);
        expect((await requestApproval(own.data.cart.id, admin.token)).data.message).toContain(
          "doesn't need approval"
        );
        expect((await b2b.checkout(own.data.cart.id, admin.token)).order).not.toBeNull();

        await b2b.approvalSettings(company.id, {
          requires_admin_approval: true,
          requires_sales_manager_approval: true,
        });
        const next = await b2b.cart(admin.token, 1);
        const blocked = await b2b.checkout(next.data.cart.id, admin.token);
        expect(blocked.refused).toContain("sales manager's approval");

        const asked = await requestApproval(next.data.cart.id, admin.token);
        const approval = asked.data.approvals[0];
        expect(approval.type).toEqual("sales_manager");
        // Not through the store: the merchant decides in the admin.
        expect((await decide(approval.id, admin.token, "approved")).status).not.toEqual(200);
        const merchant = await call(
          api.post(`/admin/approvals/${approval.id}`, { status: "approved" }, adminHeaders)
        );
        expect(merchant.status).toEqual(200);
        expect((await b2b.checkout(next.data.cart.id, admin.token)).order).not.toBeNull();
      });

      it("accepting a quote runs the checkout rules: own quote, approved company, credit limit", async () => {
        const probe = await b2b.company();
        const probeBuyer = await b2b.employee(probe.id);
        const unit = (await b2b.cart(probeBuyer.token, 1)).data.cart.item_total;

        const company = await b2b.company({
          payment_terms: "net_30",
          credit_limit: Math.floor(unit * 1.5),
        });
        const buyer = await b2b.employee(company.id);
        const colleague = await b2b.employee(company.id);

        const quoteFor = async (token: string, quantity: number) => {
          const { data } = await b2b.cart(token, quantity);
          const {
            data: { quote },
          } = await api.post("/store/quotes", { cart_id: data.cart.id }, b2b.store(token));
          await api.post(`/admin/quotes/${quote.id}/send`, {}, adminHeaders);
          return quote;
        };
        const accept = (quoteId: string, token: string) =>
          call(api.post(`/store/quotes/${quoteId}/accept`, {}, b2b.store(token)));

        const first = await quoteFor(buyer.token, 1);
        // Someone else's quote.
        expect((await accept(first.id, colleague.token)).status).not.toEqual(200);
        expect((await accept(first.id, buyer.token)).status).toEqual(200);

        // The first accepted order is unpaid, so a second one is over the
        // credit limit.
        const second = await quoteFor(colleague.token, 1);
        const refused = await accept(second.id, colleague.token);
        expect(refused.status).not.toEqual(200);
        expect(JSON.stringify(refused.data)).toContain("credit limit");

        // A suspended company can't accept either.
        await api.post(`/admin/companies/${company.id}`, { status: "suspended" }, adminHeaders);
        const third = await call(b2b.cart(colleague.token, 1));
        expect(third.status).toEqual(400);
      });
    });
  },
});
