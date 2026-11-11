import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { COMPANY_MODULE } from "../modules/company";
import { loadBuyer } from "../utils/load-b2b-buyer";

// Every placed order is linked to the buyer's company (REVIEW_FIXES B5). The
// starter links orders in a createOrderWorkflow hook, which only runs for
// quotes (draft orders): a normal checkout creates its order inside
// completeCartWorkflow, which has no official hook for it. The link keeps an
// order counted against the company's credit after its employee leaves (B4).
export default async function linkOrderToCompany({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const {
      data: [order],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: ["id", "customer_id", "company.id"],
      filters: { id: data.id },
    });
    if (!order?.customer_id || (order as { company?: { id?: string } | null }).company?.id) {
      return;
    }
    const companyId = (await loadBuyer(container, order.customer_id))?.employee
      ?.company?.id;
    if (!companyId) {
      return;
    }
    await container.resolve(ContainerRegistrationKeys.LINK).create({
      [Modules.ORDER]: { order_id: order.id },
      [COMPANY_MODULE]: { company_id: companyId },
    });
  } catch (error) {
    logger.warn(
      `Order ${data.id} not linked to its company: ${(error as Error).message}`
    );
  }
}

export const config: SubscriberConfig = { event: "order.placed" };
