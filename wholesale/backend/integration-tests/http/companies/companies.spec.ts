import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { adminHeaders } from "../../utils/admin";
import { call, setupB2b } from "../../utils/b2b";

jest.setTimeout(240 * 1000);

// P4-07 (plan §6.4, F-058): `/store/companies/me…` works on the signed-in
// customer's own company (from their employee record). The starter's
// `/store/companies/:id…` routes, which took the company from the URL, are
// gone. Replaces the starter's companies spec.
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("store company routes (TASKS P4-07)", () => {
      let b2b: Awaited<ReturnType<typeof setupB2b>>;

      const signUp = (token: string, name = "New Traders") =>
        call(
          api.post(
            "/store/companies",
            { name, email: "office@new.test", currency_code: "eur" },
            b2b.store(token)
          )
        );
      const get = (path: string, token?: string) =>
        call(api.get(path, b2b.store(token)));
      const post = (path: string, body: unknown, token?: string) =>
        call(api.post(path, body, b2b.store(token)));
      const del = (path: string, token?: string) =>
        call(api.delete(path, b2b.store(token)));

      beforeEach(async () => {
        delete process.env.WHOLESALE_REQUIRE_APPROVAL;
        b2b = await setupB2b(api, getContainer());
      });
      afterAll(() => {
        delete process.env.WHOLESALE_REQUIRE_APPROVAL;
      });

      it("sign-up creates the company with the customer as its admin, once", async () => {
        const founder = await b2b.register();
        const res = await signUp(founder.token);
        expect(res.status).toEqual(200);
        expect(res.data.company).toEqual(
          expect.objectContaining({ name: "New Traders", status: "approved" })
        );
        expect(res.data.company.employees).toEqual([
          expect.objectContaining({ is_admin: true }),
        ]);

        const me = await get("/store/companies/me", founder.token);
        expect(me.data.company.id).toEqual(res.data.company.id);

        const again = await signUp(founder.token, "Second Company");
        expect(again.status).toEqual(400);
        expect(again.data.message).toContain("already belongs to a company");
      });

      it("WHOLESALE_REQUIRE_APPROVAL=true: a new company is pending and can't buy until approved", async () => {
        process.env.WHOLESALE_REQUIRE_APPROVAL = "true";
        const founder = await b2b.register();
        const { data } = await signUp(founder.token);
        expect(data.company.status).toEqual("pending");

        const blocked = await b2b.cart(founder.token, 1);
        expect(blocked.status).toEqual(400);
        expect(blocked.data.message).toContain("waiting for approval");

        // The buyer can't approve themselves.
        expect(
          (await post("/store/companies/me", { status: "approved" }, founder.token)).status
        ).toEqual(400);

        await api.post(
          `/admin/companies/${data.company.id}`,
          { status: "approved" },
          adminHeaders
        );
        expect((await b2b.cart(founder.token, 1)).status).toEqual(200);
      });

      it("needs a signed-in member: guests get 401, customers without a company 403", async () => {
        expect((await get("/store/companies/me")).status).toEqual(401);
        const loner = await b2b.register();
        for (const path of ["/store/companies/me", "/store/companies/me/employees"]) {
          expect((await get(path, loner.token)).status).toEqual(403);
        }
      });

      it("members read their own company and colleagues; only admins change them", async () => {
        const company = await b2b.company({ payment_terms: "net_30", credit_limit: 5000 });
        const admin = await b2b.employee(company.id, { is_admin: true });
        const buyer = await b2b.employee(company.id, { spending_limit: 100 });

        const me = await get("/store/companies/me", buyer.token);
        expect(me.data.company).toEqual(
          expect.objectContaining({
            id: company.id,
            payment_terms: "net_30",
            credit_limit: 5000,
            status: "approved",
          })
        );

        const list = await get("/store/companies/me/employees", buyer.token);
        expect(list.data.count).toEqual(2);
        const buyerEmployee = list.data.employees.find(
          (e) => e.customer.id === buyer.customer.id
        );
        expect(buyerEmployee.spending_limit).toEqual(100);

        // A plain employee can't write anything.
        const path = `/store/companies/me/employees/${buyerEmployee.id}`;
        expect((await post("/store/companies/me", { name: "Mine" }, buyer.token)).status).toEqual(403);
        expect((await post(path, { spending_limit: 999999 }, buyer.token)).status).toEqual(403);
        expect((await post(path, { is_admin: true }, buyer.token)).status).toEqual(403);
        expect((await del(path, buyer.token)).status).toEqual(403);
        expect(
          (await post("/store/companies/me/approval-settings", { requires_admin_approval: false }, buyer.token)).status
        ).toEqual(403);

        // The admin can.
        expect((await post("/store/companies/me", { name: "Acme Ltd" }, admin.token)).data.company.name).toEqual("Acme Ltd");
        expect((await post(path, { spending_limit: 250 }, admin.token)).data.employee.spending_limit).toEqual(250);
        expect(
          (await post("/store/companies/me/approval-settings", { requires_admin_approval: true }, admin.token)).status
        ).toEqual(201);
        expect(
          (await get("/store/companies/me", admin.token)).data.company.approval_settings.requires_admin_approval
        ).toEqual(true);

        // A new colleague: a customer who isn't in a company yet.
        const recruit = await b2b.register();
        const added = await post(
          "/store/companies/me/employees",
          { customer_id: recruit.customer.id, spending_limit: 50 },
          admin.token
        );
        expect(added.status).toEqual(200);
        expect((await get("/store/companies/me", recruit.token)).data.company.id).toEqual(company.id);

        expect((await del(path, admin.token)).data.deleted).toEqual(true);
        expect((await get("/store/companies/me", buyer.token)).status).toEqual(403);
      });

      it("a company keeps at least one admin", async () => {
        const company = await b2b.company();
        const admin = await b2b.employee(company.id, { is_admin: true });
        const { data } = await get("/store/companies/me/employees", admin.token);
        const path = `/store/companies/me/employees/${data.employees[0].id}`;

        expect((await post(path, { is_admin: false }, admin.token)).status).toEqual(400);
        expect((await del(path, admin.token)).status).toEqual(400);
      });

      it("an admin of company B can't reach company A", async () => {
        const a = await b2b.company();
        const aAdmin = await b2b.employee(a.id, { is_admin: true });
        const aBuyer = await b2b.employee(a.id);
        const b = await b2b.company();
        const bAdmin = await b2b.employee(b.id, { is_admin: true });

        const aEmployees = (await get("/store/companies/me/employees", aAdmin.token)).data.employees;
        const aBuyerEmployee = aEmployees.find((e) => e.customer.id === aBuyer.customer.id);

        // The starter's URL-id routes no longer exist.
        expect((await get(`/store/companies/${a.id}`, bAdmin.token)).status).toEqual(404);
        expect((await post(`/store/companies/${a.id}`, { name: "Taken" }, bAdmin.token)).status).toEqual(404);
        expect((await del(`/store/companies/${a.id}`, bAdmin.token)).status).toEqual(404);
        expect((await get(`/store/companies/${a.id}/employees`, bAdmin.token)).status).toEqual(404);
        expect(
          (await post(`/store/companies/${a.id}/approval-settings`, { requires_admin_approval: false }, bAdmin.token)).status
        ).toEqual(404);

        // Company A's employee through B's own routes: not found.
        const path = `/store/companies/me/employees/${aBuyerEmployee.id}`;
        expect((await get(path, bAdmin.token)).status).toEqual(404);
        expect((await post(path, { is_admin: true }, bAdmin.token)).status).toEqual(404);
        expect((await del(path, bAdmin.token)).status).toEqual(404);

        // B can't take A's employee into B.
        const poach = await post(
          "/store/companies/me/employees",
          { customer_id: aBuyer.customer.id },
          bAdmin.token
        );
        expect(poach.status).toEqual(400);
        expect(poach.data.message).toContain("already belongs to a company");

        // B's list shows only B.
        const bList = (await get("/store/companies/me/employees", bAdmin.token)).data.employees;
        expect(bList.map((e) => e.customer.id)).toEqual([bAdmin.customer.id]);
        expect((await get("/store/companies/me", aBuyer.token)).data.company.name).toEqual("Acme Wholesale");
      });

      it("quotes and approval lists stay inside the customer and the company", async () => {
        const a = await b2b.company();
        await b2b.approvalSettings(a.id, { requires_admin_approval: true });
        const aBuyer = await b2b.employee(a.id);
        const aColleague = await b2b.employee(a.id);
        const b = await b2b.company();
        const bAdmin = await b2b.employee(b.id, { is_admin: true });

        const { data: cartData } = await b2b.cart(aBuyer.token, 1);
        // A quote only for the customer's own cart.
        expect(
          (await post("/store/quotes", { cart_id: cartData.cart.id }, bAdmin.token)).status
        ).toEqual(404);
        const {
          data: { quote },
        } = await post("/store/quotes", { cart_id: cartData.cart.id }, aBuyer.token);

        for (const other of [bAdmin, aColleague]) {
          expect((await get(`/store/quotes/${quote.id}`, other.token)).status).toEqual(404);
          expect((await get(`/store/quotes/${quote.id}/preview`, other.token)).status).toEqual(404);
          expect(
            (await post(`/store/quotes/${quote.id}/messages`, { text: "hi" }, other.token)).status
          ).toEqual(404);
          expect((await post(`/store/quotes/${quote.id}/reject`, {}, other.token)).status).toEqual(404);
          expect((await get("/store/quotes", other.token)).data.quotes).toEqual([]);
        }
        expect((await get(`/store/quotes/${quote.id}/preview`, aBuyer.token)).status).toEqual(200);
        expect(
          (await post(`/store/quotes/${quote.id}/messages`, { text: "hi" }, aBuyer.token)).status
        ).toEqual(200);

        // Approval requests of company A are not in B's list, and a plain
        // employee has no list.
        const second = await b2b.cart(aBuyer.token, 1);
        await post(`/store/carts/${second.data.cart.id}/approvals`, {}, aBuyer.token);
        const bList = await get("/store/approvals", bAdmin.token);
        expect(bList.status).toEqual(200);
        expect(bList.data.carts_with_approvals).toEqual([]);
        expect((await get("/store/approvals", aBuyer.token)).status).toEqual(403);
      });
    });
  },
});
