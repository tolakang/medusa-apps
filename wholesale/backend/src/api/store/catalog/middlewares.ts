import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { authenticate } from "@medusajs/medusa";

// F-068: wholesale prices are for signed-in buyers. With
// WHOLESALE_REQUIRE_LOGIN on (the default; "false" turns it off), the Store
// API's product, variant and search routes need a signed-in customer, so the
// publishable key alone (it is in the storefront's page source) no longer
// reads products or prices. Regions, categories and collections stay open:
// the sign-in page needs them and they carry no prices.
export const catalogLoginRequired = () =>
  process.env.WHOLESALE_REQUIRE_LOGIN !== "false";

const requireCustomer = authenticate("customer", ["session", "bearer"]);

const signedInBuyersOnly = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => (catalogLoginRequired() ? requireCustomer(req, res, next) : next());

export const storeCatalogMiddlewares: MiddlewareRoute[] = [
  "/store/products*",
  "/store/product-variants*",
  "/store/search*",
].map((matcher) => ({
  method: "ALL" as const,
  matcher,
  middlewares: [signedInBuyersOnly],
}));
