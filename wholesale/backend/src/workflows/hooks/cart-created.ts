import { createCartWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { COMPANY_MODULE } from "../../modules/company";
import { CartDTO } from "@medusajs/framework/types";
import { loadBuyer } from "../../utils/load-b2b-buyer";

createCartWorkflow.hooks.cartCreated(
  async (
    { cart },
    { container }
  ): Promise<
    | StepResponse<undefined, null>
    | StepResponse<undefined, { cart_id: string; company_id: string }>
  > => {
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);

    const cartInputdata = cart as CartDTO;

    // P4-05: the cart's company is the customer's company (employee record).
    // The starter used `metadata.company_id`, which the client sets, so a
    // buyer could leave their company's approval rules behind.
    const buyer = await loadBuyer(container, cartInputdata.customer_id);
    const companyId = buyer?.employee?.company?.id;

    if (!companyId) {
      return new StepResponse(undefined, null);
    }

    await remoteLink.create({
      [COMPANY_MODULE]: {
        company_id: companyId,
      },
      [Modules.CART]: {
        cart_id: cartInputdata.id,
      },
    });

    return new StepResponse(undefined, {
      cart_id: cartInputdata.id,
      company_id: companyId,
    });
  },
  async (
    input: { cart_id: string; company_id: string } | null,
    { container }
  ) => {
    if (!input) {
      return;
    }

    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);

    await remoteLink.dismiss({
      [COMPANY_MODULE]: {
        company_id: input.company_id,
      },
      [Modules.CART]: {
        cart_id: input.cart_id,
      },
    });
  }
);
