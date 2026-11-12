import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { authenticate } from "@medusajs/medusa";
import { loadBuyer } from "../../../utils/load-b2b-buyer";

// F-068: wholesale prices are for signed-in buyers. With
// WHOLESALE_REQUIRE_LOGIN on (the default; "false" turns it off), the Store
// API's product, variant and search routes need a signed-in customer, so the
// publishable key alone (it is in the storefront's page source) no longer
// reads products or prices. Regions, categories and collections stay open
// (the sign-in page needs them), except collections when `fields` asks for
// their products: core lets collections return `products.variants.prices`,
// which are every price and price-list (tier) price (review 2, A2).
// Categories only allow product titles, images and options (no prices), and
// the storefront's menu reads them with `*products`, so they stay open.
export const catalogLoginRequired = () =>
  process.env.WHOLESALE_REQUIRE_LOGIN !== "false";

const requireCustomer = authenticate("customer", ["session", "bearer"]);

export const NOT_APPROVED_MESSAGE =
  "Your company's account isn't approved yet, so prices aren't shown.";

const signedInBuyersOnly = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => (catalogLoginRequired() ? requireCustomer(req, res, next) : next());

// REVIEW_FIXES X4: being signed in isn't enough. Only an employee of an
// approved company sees the catalog and its prices, so a customer without a
// company, or one whose company still waits for approval
// (WHOLESALE_REQUIRE_APPROVAL) or is suspended, gets 403.
const approvedCompaniesOnly = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  if (!catalogLoginRequired()) {
    return next();
  }
  const customerId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id;
  const buyer = customerId ? await loadBuyer(req.scope, customerId) : null;
  if (buyer?.employee?.company?.status !== "approved") {
    res.status(403).json({ type: "not_allowed", message: NOT_APPROVED_MESSAGE });
    return;
  }
  next();
};

// Collections: the buyer checks only when `fields` reaches into products (`*products`, `products.variants.prices`, ...).
const asksForProducts = (req: MedusaRequest) =>
  /products/.test(String(req.query?.fields ?? ""));

const buyersOnlyForProducts = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  if (!asksForProducts(req)) {
    return next();
  }
  signedInBuyersOnly(req, res, (error?: unknown) =>
    error ? next(error) : approvedCompaniesOnly(req, res, next)
  );
};

export const storeCatalogMiddlewares: MiddlewareRoute[] = [
  ...["/store/products*", "/store/product-variants*", "/store/search*"].map(
    (matcher) => ({
      method: "ALL" as const,
      matcher,
      middlewares: [signedInBuyersOnly, approvedCompaniesOnly],
    })
  ),
  {
    method: "ALL" as const,
    matcher: "/store/collections*",
    middlewares: [buyersOnlyForProducts],
  },
];
