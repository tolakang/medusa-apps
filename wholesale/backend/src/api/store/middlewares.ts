import { MiddlewareRoute } from "@medusajs/medusa";
import { storeApprovalsMiddlewares } from "./approvals/middlewares";
import { storeCartsMiddlewares } from "./carts/middlewares";
import { storeCatalogMiddlewares } from "./catalog/middlewares";
import { storeCompaniesMiddlewares } from "./companies/middlewares";
import { storeFreeShippingMiddlewares } from "./free-shipping/middlewares";
import { storeInvoicesMiddlewares } from "./invoices/middlewares";
import { storeQuotesMiddlewares } from "./quotes/middlewares";
import { requireProviderForTerms } from "./payment-terms-middleware";
import { storeSearchMiddlewares } from "./search/middlewares";

export const storeMiddlewares: MiddlewareRoute[] = [
  // First, so a guest is refused before the search route does any work.
  ...storeCatalogMiddlewares,
  ...storeCartsMiddlewares,
  ...storeCompaniesMiddlewares,
  ...storeQuotesMiddlewares,
  ...storeFreeShippingMiddlewares,
  ...storeApprovalsMiddlewares,
  ...storeSearchMiddlewares,
  ...storeInvoicesMiddlewares,
  {
    // TASKS P4-12: PayWay for prepaid companies, invoice for net terms.
    method: ["POST"],
    matcher: "/store/payment-collections/:id/payment-sessions",
    middlewares: [requireProviderForTerms],
  },
];
