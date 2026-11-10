import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { RemoteQueryFunction } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { requireOwnQuote } from "../../../../../utils/b2b-access";
import { customerRejectQuoteWorkflow } from "../../../../../workflows/quote/workflows";
import { RejectQuoteType } from "../../validators";

export const POST = async (
  req: AuthenticatedMedusaRequest<RejectQuoteType>,
  res: MedusaResponse
) => {
  const { id } = req.params;
  const query = req.scope.resolve<RemoteQueryFunction>(
    ContainerRegistrationKeys.QUERY
  );

  // P4-07: only the quote's own customer.
  await requireOwnQuote(req.scope, id, req.auth_context.actor_id);

  await customerRejectQuoteWorkflow(req.scope).run({
    input: {
      quote_id: id,
      ...req.validatedBody,
    },
  });

  const {
    data: [quote],
  } = await query.graph(
    {
      entity: "quote",
      fields: req.queryConfig.fields,
      filters: { id },
    },
    { throwIfKeyNotFound: true }
  );

  return res.json({ quote });
};
