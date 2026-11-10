import { authenticate, MiddlewareRoute } from "@medusajs/framework";

// P4-06: invoices need a signed-in customer.
export const storeInvoicesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/store/invoices",
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    method: ["GET"],
    matcher: "/store/orders/:id/invoice",
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
];
