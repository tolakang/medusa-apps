import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { call, setupB2b } from "../utils/b2b";
import {
  NET_TERMS_ON_INVOICE_MESSAGE,
  PREPAID_PAY_ONLINE_MESSAGE,
} from "../../src/utils/payment-terms-provider";

// TASKS P4-12 (D9): with PayWay set up, prepaid companies pay with PayWay
// and companies on net terms on invoice. Fake credentials: medusa-config
// registers pp_payway_payway when these are set (as ecommerce's payway.spec).
process.env.PAYWAY_MERCHANT_ID = "ec000002";
process.env.PAYWAY_API_KEY = "test-api-key";
process.env.PAYWAY_RETURN_URL = "https://api.example.com/hooks/payment/payway_payway";
process.env.STOREFRONT_URL = "https://shop.example.com";

jest.setTimeout(240 * 1000);

medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("payment method by payment terms (TASKS P4-12)", () => {
      let b2b: Awaited<ReturnType<typeof setupB2b>>;

      beforeEach(async () => {
        b2b = await setupB2b(api, getContainer());
        await updateRegionsWorkflow(getContainer()).run({
          input: {
            selector: { id: b2b.regionId },
            update: { payment_providers: ["pp_system_default", "pp_payway_payway"] },
          },
        });
      });

      const startPayment = async (token: string, providerId: string) => {
        const { data } = await b2b.cart(token, 1);
        const {
          data: { payment_collection },
        } = await api.post(
          "/store/payment-collections",
          { cart_id: data.cart.id },
          b2b.store(token)
        );
        return {
          cartId: data.cart.id as string,
          res: await call(
            api.post(
              `/store/payment-collections/${payment_collection.id}/payment-sessions`,
              { provider_id: providerId },
              b2b.store(token)
            )
          ),
        };
      };

      it("the region offers both providers", async () => {
        const buyer = await b2b.employee((await b2b.company()).id);
        const { data } = await api.get(
          `/store/payment-providers?region_id=${b2b.regionId}`,
          b2b.store(buyer.token)
        );
        expect(data.payment_providers.map((p: { id: string }) => p.id).sort()).toEqual([
          "pp_payway_payway",
          "pp_system_default",
        ]);
      });

      it("a prepaid company can't buy on invoice", async () => {
        const company = await b2b.company({ payment_terms: "prepaid" });
        const buyer = await b2b.employee(company.id);
        const { res } = await startPayment(buyer.token, "pp_system_default");
        expect(res.status).toEqual(400);
        expect(res.data.message).toEqual(PREPAID_PAY_ONLINE_MESSAGE);
      });

      it("a PayWay payment can't start for a cart checkout would refuse (review 2, M3)", async () => {
        const company = await b2b.company({ payment_terms: "prepaid" });
        // Any cart is over this employee's limit.
        const buyer = await b2b.employee(company.id, { spending_limit: 1 });
        const { res } = await startPayment(buyer.token, "pp_payway_payway");
        expect(res.status).toEqual(400);
        expect(res.data.message).toContain("exceeds spending limit");

        // Within the limit, PayWay starts as before.
        const ok = await b2b.employee(company.id);
        expect((await startPayment(ok.token, "pp_payway_payway")).res.status).toEqual(200);
      });

      it("a net-terms company can't be sent to PayWay, and buys on invoice", async () => {
        const company = await b2b.company({ payment_terms: "net_30" });
        const buyer = await b2b.employee(company.id);
        const refused = await startPayment(buyer.token, "pp_payway_payway");
        expect(refused.res.status).toEqual(400);
        expect(refused.res.data.message).toEqual(NET_TERMS_ON_INVOICE_MESSAGE);

        const { data } = await b2b.cart(buyer.token, 1);
        const { order } = await b2b.checkout(data.cart.id, buyer.token);
        expect(order).toBeTruthy();
      });
    });
  },
});
