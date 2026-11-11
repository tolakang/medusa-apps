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
// reads products or prices. Regions, categories and collections stay open:
// the sign-in page needs them and they carry no prices.
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

export const storeCatalogMiddlewares: MiddlewareRoute[] = [
  "/store/products*",
  "/store/product-variants*",
  "/store/search*",
].map((matcher) => ({
  method: "ALL" as const,
  matcher,
  middlewares: [signedInBuyersOnly, approvedCompaniesOnly],
}));
