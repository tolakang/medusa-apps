import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { loadBuyer } from "../../utils/load-b2b-buyer";

// One order at a time per company (REVIEW_FIXES B6). The spending and credit
// limits are checked by reading the company's earlier orders, and Medusa only
// locks the cart, so two carts (or a cart and a quote) of one company placed
// at the same moment could both pass. This middleware runs the rest of the
// request inside a lock on the company (Locking Module `execute`), so the
// second one waits and then sees the first one's order.
const WAIT_SECONDS = 20;
const EXPIRE_SECONDS = 60;

export const COMPANY_BUSY_MESSAGE =
  "Another order for your company is being placed. Please try again in a moment.";

/** `customerOf` finds the buyer of the request (the cart's or the signed-in one). */
export const oneOrderPerCompanyAtATime =
  (customerOf: (req: MedusaRequest) => Promise<string | null | undefined>) =>
  async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    let companyId: string | undefined;
    try {
      const customerId = await customerOf(req);
      companyId = customerId
        ? (await loadBuyer(req.scope, customerId))?.employee?.company?.id
        : undefined;
    } catch {
      // Not found, not signed in: the route answers that itself.
    }
    if (!companyId) {
      return next();
    }

    let started = false;
    try {
      await req.scope.resolve(Modules.LOCKING).execute(
        `b2b-company-order:${companyId}`,
        () =>
          new Promise<void>((resolve) => {
            started = true;
            res.once("finish", () => resolve());
            res.once("close", () => resolve());
            next();
          }),
        { timeout: WAIT_SECONDS, expire: EXPIRE_SECONDS }
      );
    } catch (error) {
      if (started) {
        // The route already ran; only the lock's bookkeeping failed.
        req.scope
          .resolve(ContainerRegistrationKeys.LOGGER)
          .warn(`Company order lock: ${(error as Error).message}`);
        return;
      }
      next(new MedusaError(MedusaError.Types.CONFLICT, COMPANY_BUSY_MESSAGE));
    }
  };

/** The customer of the cart in `/store/carts/:id/...`. */
export const cartCustomer = async (req: MedusaRequest) => {
  const {
    data: [cart],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "cart",
    fields: ["id", "customer_id"],
    filters: { id: req.params.id },
  });
  return cart?.customer_id;
};

/** The signed-in customer (routes behind `authenticate`). */
export const signedInCustomer = async (req: MedusaRequest) =>
  (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context
    ?.actor_id;
