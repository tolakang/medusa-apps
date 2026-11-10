import type { ExecArgs } from "@medusajs/framework/types";
import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createCustomerGroupsWorkflow,
  createDefaultsWorkflow,
  createPriceListsWorkflow,
  createSalesChannelsWorkflow,
  linkProductsToSalesChannelWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";

// P4-03 (plan §6.4): the B2B catalog scope and the price tiers.
//
//   pnpm seed:b2b                    channel + key (safe to run in production)
//   pnpm seed:b2b demo-pricing       also Gold / Silver groups and price lists
//
// Every step looks for what it would create first, so running it again
// changes nothing. Products stay in the default channel too, so the
// first-boot key keeps working (TASKS F-017).

export const B2B_SALES_CHANNEL_NAME = "Wholesale";
export const B2B_PUBLISHABLE_KEY_TITLE = "Wholesale storefront";

// Demo tiers: a group's price for 1-9 units and for 10 or more, as a share of
// the base price. "sale" price lists apply only when lower than the base
// price, so a tier can never cost more than the list price.
export const DEMO_PRICE_TIERS = [
  { group: "Gold", share: 0.8, volumeShare: 0.75 },
  { group: "Silver", share: 0.9, volumeShare: 0.85 },
] as const;
export const VOLUME_MIN_QUANTITY = 10;

type Logger = { info: (message: string) => void };

export async function setupB2bCatalog(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const { result: store } = await createDefaultsWorkflow(container).run();
  if (!store?.default_sales_channel_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The default store has no default sales channel."
    );
  }

  // 1. The B2B sales channel.
  const {
    data: [existingChannel],
  } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
    filters: { name: B2B_SALES_CHANNEL_NAME },
  });
  let channelId = existingChannel?.id as string | undefined;
  if (!channelId) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: B2B_SALES_CHANNEL_NAME,
            description: "B2B catalog for company buyers (TASKS P4-03)",
          },
        ],
      },
    });
    channelId = result[0].id;
    logger.info(`Created sales channel "${B2B_SALES_CHANNEL_NAME}".`);
  }

  // 2. Its own publishable key.
  const {
    data: [existingKey],
  } = await query.graph({
    entity: "api_key",
    fields: ["id", "token", "sales_channels.id"],
    filters: { type: "publishable", title: B2B_PUBLISHABLE_KEY_TITLE },
  });
  let key = existingKey as
    | { id: string; token: string; sales_channels?: { id: string }[] }
    | undefined;
  if (!key) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: B2B_PUBLISHABLE_KEY_TITLE,
            type: "publishable",
            created_by: "",
          },
        ],
      },
    });
    key = { id: result[0].id, token: result[0].token, sales_channels: [] };
    logger.info(`Created publishable key "${B2B_PUBLISHABLE_KEY_TITLE}".`);
  }
  if (!key.sales_channels?.some((channel) => channel?.id === channelId)) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: key.id, add: [channelId] },
    });
  }

  // 3. The stock locations of the default channel, so carts in the B2B
  //    channel can reserve stock.
  const {
    data: [defaultChannel],
  } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "stock_locations.id"],
    filters: { id: store.default_sales_channel_id },
  });
  const {
    data: [b2bChannel],
  } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "stock_locations.id"],
    filters: { id: channelId },
  });
  const linkedLocations = new Set(
    (b2bChannel?.stock_locations ?? []).map((location) => location?.id)
  );
  for (const location of defaultChannel?.stock_locations ?? []) {
    if (location?.id && !linkedLocations.has(location.id)) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: location.id, add: [channelId] },
      });
    }
  }

  // 4. Every product joins the B2B channel (this backend is B2B only).
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "sales_channels.id"],
  });
  const toAdd = products
    .filter(
      (product) =>
        !(product.sales_channels ?? []).some(
          (channel) => channel?.id === channelId
        )
    )
    .map((product) => product.id);
  if (toAdd.length) {
    await linkProductsToSalesChannelWorkflow(container).run({
      input: { id: channelId, add: toAdd },
    });
    logger.info(`Added ${toAdd.length} products to "${B2B_SALES_CHANNEL_NAME}".`);
  }

  return { salesChannelId: channelId, publishableKey: key.token };
}

export async function setupDemoPriceTiers(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  // Base prices: currency prices with no rule and no price list.
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "price_set.prices.amount",
      "price_set.prices.currency_code",
      "price_set.prices.price_list_id",
      "price_set.prices.rules_count",
      "price_set.prices.min_quantity",
    ],
  });

  const groupIds: Record<string, string> = {};
  for (const tier of DEMO_PRICE_TIERS) {
    const {
      data: [group],
    } = await query.graph({
      entity: "customer_group",
      fields: ["id"],
      filters: { name: tier.group },
    });
    if (group?.id) {
      groupIds[tier.group] = group.id;
      continue;
    }
    const { result } = await createCustomerGroupsWorkflow(container).run({
      input: { customersData: [{ name: tier.group }] },
    });
    groupIds[tier.group] = result[0].id;
    logger.info(`Created customer group "${tier.group}".`);
  }

  for (const tier of DEMO_PRICE_TIERS) {
    const title = `${tier.group} prices`;
    const {
      data: [existing],
    } = await query.graph({
      entity: "price_list",
      fields: ["id"],
      filters: { title },
    });
    if (existing?.id) {
      continue;
    }

    const prices = variants.flatMap((variant) =>
      (variant.price_set?.prices ?? [])
        .filter(
          (price) =>
            price &&
            !price.price_list_id &&
            !price.rules_count &&
            !price.min_quantity
        )
        .flatMap((price) => [
          {
            variant_id: variant.id,
            currency_code: price!.currency_code as string,
            amount: MathBN.convert(MathBN.mult(price!.amount as number, tier.share), 2).toNumber(),
            max_quantity: VOLUME_MIN_QUANTITY - 1,
          },
          {
            variant_id: variant.id,
            currency_code: price!.currency_code as string,
            amount: MathBN.convert(MathBN.mult(price!.amount as number, tier.volumeShare), 2).toNumber(),
            min_quantity: VOLUME_MIN_QUANTITY,
          },
        ])
    );

    await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title,
            description: `${tier.group} customer group: ${Math.round(
              (1 - tier.share) * 100
            )}% off, ${Math.round((1 - tier.volumeShare) * 100)}% off from ${VOLUME_MIN_QUANTITY} units (demo, TASKS P4-03)`,
            status: "active",
            rules: { "customer.groups.id": [groupIds[tier.group]] },
            prices,
          },
        ],
      },
    });
    logger.info(`Created price list "${title}" (${prices.length} prices).`);
  }

  return groupIds;
}

export default async function seedB2b({ container, args }: ExecArgs) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { publishableKey } = await setupB2bCatalog(container);
  if (args?.includes("demo-pricing")) {
    await setupDemoPriceTiers(container);
  }
  logger.info(
    `B2B storefront publishable key (NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY): ${publishableKey}`
  );
}
