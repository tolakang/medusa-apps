import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { INVOICE_MODULE } from "../../src/modules/invoice";
import InvoiceModuleService from "../../src/modules/invoice/service";
import { adminHeaders } from "../utils/admin";
import { call, setupB2b } from "../utils/b2b";

jest.setTimeout(240 * 1000);

// P4-06 (plan §6.4): net-terms orders pay through the system provider and
// are captured in the admin when the invoice is paid; every order has an
// invoice PDF (invoice tutorial pattern) with the terms and due date.
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("B2B invoices (TASKS P4-06)", () => {
      let b2b: Awaited<ReturnType<typeof setupB2b>>;

      beforeEach(async () => {
        b2b = await setupB2b(api, getContainer());
      });

      const invoices = () =>
        getContainer().resolve<InvoiceModuleService>(INVOICE_MODULE);
      // order.placed is handled asynchronously.
      const invoiceOf = async (orderId: string) => {
        for (let i = 0; i < 40; i++) {
          const [invoice] = await invoices().listInvoices({ order_id: orderId });
          if (invoice) {
            return invoice;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return null;
      };
      const pdf = (path: string, headers: { headers: Record<string, string> }) =>
        call(api.get(path, { ...headers, responseType: "arraybuffer" }));

      const placeOrder = async () => {
        const company = await b2b.company({
          payment_terms: "net_30",
          tax_id: "KH-778899",
        });
        const buyer = await b2b.employee(company.id);
        const { data } = await b2b.cart(buyer.token, 1);
        const { order } = await b2b.checkout(data.cart.id, buyer.token);
        return { company, buyer, order };
      };

      it("a placed order gets its invoice: number, company, tax ID, terms and due date", async () => {
        const { company, order } = await placeOrder();
        const invoice = await invoiceOf(order.id);

        expect(invoice).toEqual(
          expect.objectContaining({
            company_id: company.id,
            company_name: "Acme Wholesale",
            tax_id: "KH-778899",
            payment_terms: "net_30",
          })
        );
        expect(invoice!.display_id).toBeGreaterThan(0);
        const days =
          (new Date(invoice!.due_at).getTime() - new Date(invoice!.issued_at).getTime()) /
          86_400_000;
        expect(days).toEqual(30);

        // A later change to the company doesn't rewrite the issued invoice.
        await api.post(`/admin/companies/${company.id}`, { tax_id: "NEW" }, adminHeaders);
        const res = await pdf(`/admin/orders/${order.id}/invoice`, adminHeaders);
        expect(res.status).toEqual(200);
        expect(res.headers["content-type"]).toContain("application/pdf");
        expect(res.headers["content-disposition"]).toMatch(/INV-\d{6}\.pdf/);
        expect(Buffer.from(res.data).subarray(0, 5).toString()).toEqual("%PDF-");
        expect((await invoices().listInvoices({ order_id: order.id }))[0].tax_id).toEqual(
          "KH-778899"
        );
      });

      it("the buyer and their company admin see the invoice; nobody else does", async () => {
        const { company, buyer, order } = await placeOrder();
        const colleague = await b2b.employee(company.id);
        const admin = await b2b.employee(company.id, { is_admin: true });
        const other = await b2b.company();
        const otherAdmin = await b2b.employee(other.id, { is_admin: true });
        const path = `/store/orders/${order.id}/invoice`;

        expect((await pdf(path, b2b.store(buyer.token))).status).toEqual(200);
        expect((await pdf(path, b2b.store(admin.token))).status).toEqual(200);
        expect((await pdf(path, b2b.store(colleague.token))).status).toEqual(404);
        expect((await pdf(path, b2b.store(otherAdmin.token))).status).toEqual(404);
        expect((await pdf(path, b2b.store())).status).toEqual(401);
      });

      it("the invoice list shows what is due until the payment is captured", async () => {
        const { company, buyer, order } = await placeOrder();
        const colleague = await b2b.employee(company.id);
        const admin = await b2b.employee(company.id, { is_admin: true });
        await invoiceOf(order.id);

        const list = (token: string) =>
          api.get("/store/invoices", b2b.store(token)).then((res) => res.data);

        const own = await list(buyer.token);
        expect(own.count).toEqual(1);
        expect(own.invoices[0]).toEqual(
          expect.objectContaining({
            order_id: order.id,
            payment_terms: "net_30",
            number: expect.stringMatching(/^INV-\d{6}$/),
            total: order.total,
            amount_due: order.total,
          })
        );
        expect((await list(colleague.token)).count).toEqual(0);
        expect((await list(admin.token)).count).toEqual(1);

        // Net terms: the system provider authorized the payment; the
        // merchant captures it when the invoice is paid.
        const {
          data: { order: adminOrder },
        } = await api.get(
          `/admin/orders/${order.id}?fields=payment_collections.payments.id`,
          adminHeaders
        );
        const paymentId = adminOrder.payment_collections[0].payments[0].id;
        await api.post(`/admin/payments/${paymentId}/capture`, {}, adminHeaders);
        expect((await list(buyer.token)).invoices[0].amount_due).toEqual(0);
      });

      it("an unaccepted quote (draft order) has no invoice", async () => {
        const company = await b2b.company();
        const buyer = await b2b.employee(company.id);
        const { data } = await b2b.cart(buyer.token, 1);
        const {
          data: { quote },
        } = await api.post("/store/quotes", { cart_id: data.cart.id }, b2b.store(buyer.token));

        const res = await pdf(`/store/orders/${quote.draft_order_id}/invoice`, b2b.store(buyer.token));
        expect(res.status).toEqual(404);
        expect(await invoices().listInvoices({ order_id: quote.draft_order_id })).toEqual([]);
      });
    });
  },
});
