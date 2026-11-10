import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { RemoteQueryFunction } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { assertApprovedCompanyBuyer } from "../../../utils/b2b-cart-rules";
import { loadBuyer } from "../../../utils/load-b2b-buyer";
import { createRequestForQuoteWorkflow } from "../../../workflows/quote/workflows/create-request-for-quote";
import { CreateQuoteType, GetQuoteParamsType } from "./validators";

export const GET = async (
  req: AuthenticatedMedusaRequest<GetQuoteParamsType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve<RemoteQueryFunction>(
    ContainerRegistrationKeys.QUERY
  );

  const { fields, pagination } = req.queryConfig;
  const { data: quotes, metadata } = await query.graph({
    entity: "quote",
    fields,
    filters: {
      customer_id: req.auth_context.actor_id,
    },
    pagination: {
      ...pagination,
      skip: pagination.skip!,
    },
  });

  res.json({
    quotes,
    count: metadata!.count,
    offset: metadata!.skip,
    limit: metadata!.take,
  });
};

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateQuoteType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve<RemoteQueryFunction>(
    ContainerRegistrationKeys.QUERY
  );

  // P4-07: a quote is asked for the customer's own cart, by an employee of
  // an approved company (the starter took any cart id).
  const customerId = req.auth_context.actor_id;
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "customer_id"],
    filters: { id: req.validatedBody.cart_id },
  });
  if (!cart || cart.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found");
  }
  assertApprovedCompanyBuyer(await loadBuyer(req.scope, customerId));

  const {
    result: { quote: createdQuote },
  } = await createRequestForQuoteWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      customer_id: req.auth_context.actor_id,
    },
  });

  const {
    data: [quote],
  } = await query.graph(
    {
      entity: "quote",
      fields: req.queryConfig.fields,
      filters: { id: createdQuote.id },
    },
    { throwIfKeyNotFound: true }
  );

  return res.json({ quote });
};
