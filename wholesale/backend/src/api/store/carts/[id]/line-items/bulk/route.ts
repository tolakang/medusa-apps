import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { addToCartWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { cartFields } from "../../../query-config";
import { StoreAddLineItemsBulkType } from "../../../validators";

export async function POST(
  req: AuthenticatedMedusaRequest<StoreAddLineItemsBulkType>,
  res: MedusaResponse
) {
  const { id } = req.params;
  const { line_items } = req.validatedBody;
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [cart],
  } = await query.graph(
    {
      entity: "cart",
      fields: cartFields,
      filters: { id },
    },
    { throwIfKeyNotFound: true }
  );

  // REVIEW_FIXES B12: only the cart's own buyer adds to it. The same answer
  // for another buyer's cart as for a missing one.
  if (cart.customer_id !== req.auth_context.actor_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Cart with id: ${id} was not found`
    );
  }

  const workflowInput = {
    cart_id: cart.id,
    items: line_items,
  };

  await addToCartWorkflow(req.scope).run({
    input: workflowInput,
  });

  const {
    data: [upatedCart],
  } = await query.graph(
    {
      entity: "cart",
      fields: cartFields,
      filters: { id },
    },
    { throwIfKeyNotFound: true }
  );

  res.json({ cart: upatedCart });
}
