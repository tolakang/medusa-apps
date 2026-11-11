import { authenticate, validateAndTransformBody } from "@medusajs/framework";
import { MiddlewareRoute } from "@medusajs/medusa";
import { cartCustomer, oneOrderPerCompanyAtATime } from "../company-order-lock";
import { StoreAddLineItemsBulk } from "./validators";

export const storeCartsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/store/carts/:id/line-items/bulk",
    // REVIEW_FIXES B12: a signed-in buyer (the route checks it is the cart's
    // own) and a fixed response (no `?fields`).
    middlewares: [
      authenticate("customer", ["session", "bearer"]),
      validateAndTransformBody(StoreAddLineItemsBulk),
    ],
  },
  {
    // REVIEW_FIXES B6: checkouts of one company run one after the other.
    method: ["POST"],
    matcher: "/store/carts/:id/complete",
    middlewares: [oneOrderPerCompanyAtATime(cartCustomer)],
  },
  {
    method: ["POST"],
    matcher: "/store/carts/:id/approvals",
    middlewares: [authenticate("customer", ["bearer", "session"])],
  },
];
