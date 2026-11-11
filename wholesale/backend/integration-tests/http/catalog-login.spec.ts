import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { call, setupB2b } from "../utils/b2b";

jest.setTimeout(240 * 1000);

// F-068: with WHOLESALE_REQUIRE_LOGIN on, products, variants, prices and
// search need a signed-in customer; the publishable key alone is refused.
medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("catalog needs a signed-in buyer (F-068)", () => {
      let b2b: Awaited<ReturnType<typeof setupB2b>>;

      beforeEach(async () => {
        // The shared setup reads the catalog as a guest.
        process.env.WHOLESALE_REQUIRE_LOGIN = "false";
        b2b = await setupB2b(api, getContainer());
        process.env.WHOLESALE_REQUIRE_LOGIN = "true";
      });

      afterAll(() => {
        process.env.WHOLESALE_REQUIRE_LOGIN = "false";
      });

      const guestPaths = [
        "/store/products",
        "/store/products?fields=*variants.calculated_price",
        "/store/product-variants",
      ];

      it("refuses a guest who only has the publishable key", async () => {
        for (const path of guestPaths) {
          expect((await call(api.get(path, b2b.store()))).status).toEqual(401);
        }
        expect(
          (
            await call(
              api.get(`/store/products/${b2b.productId}`, b2b.store())
            )
          ).status
        ).toEqual(401);
        expect(
          (
            await call(
              api.post(
                "/store/search",
                { queries: [{ entity: "product" }] },
                b2b.store()
              )
            )
          ).status
        ).toEqual(401);

        // What the sign-in page needs stays open.
        for (const path of ["/store/regions", "/store/product-categories", "/store/collections"]) {
          expect((await call(api.get(path, b2b.store()))).status).toEqual(200);
        }
      });

      it("serves a signed-in customer, and guests again when switched off", async () => {
        const buyer = await b2b.register();
        const signedIn = await call(
          api.get(
            `/store/products?region_id=${b2b.regionId}&fields=*variants.calculated_price&limit=1`,
            b2b.store(buyer.token)
          )
        );
        expect(signedIn.status).toEqual(200);
        expect(
          signedIn.data.products[0].variants[0].calculated_price.calculated_amount
        ).toBeGreaterThan(0);
        expect(
          (await call(api.get("/store/product-variants", b2b.store(buyer.token)))).status
        ).toEqual(200);

        process.env.WHOLESALE_REQUIRE_LOGIN = "false";
        expect(
          (await call(api.get("/store/products", b2b.store()))).status
        ).toEqual(200);
      });
    });
  },
});
