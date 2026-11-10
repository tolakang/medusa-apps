import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MedusaError,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils";
import {
  createDefaultsWorkflow,
  createRegionsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

// Production seed for the Cambodia shop (TASKS P1-02): USD checkout, KHR as a
// second store currency, no tax rate yet, one flat-rate Phnom Penh delivery.
// Rates and more shipping options are edited later in the admin. A country
// belongs to one region and a region has one currency, so Cambodian carts are
// in USD. Safe to re-run: it stops if the region already exists.
const REGION_NAME = "Cambodia";
const COUNTRY_CODE = "kh";
// Placeholder rate in USD; change it in the admin (Settings → Locations & Shipping).
const PHNOM_PENH_DELIVERY_USD = 1.5;

export default async function seed({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  );

  const { data: existingRegions } = await query.graph({
    entity: "region",
    fields: ["id"],
    filters: { name: REGION_NAME },
  });
  if (existingRegions.length) {
    logger.info(`Region "${REGION_NAME}" already exists; nothing to seed.`);
    return;
  }

  // Reuse the store, sales channel and publishable key Medusa created on
  // first boot (TASKS F-005, F-017).
  const { result: store } = await createDefaultsWorkflow(container).run();
  if (!store?.default_sales_channel_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The default store has no default sales channel."
    );
  }
  const salesChannelId = store.default_sales_channel_id;

  logger.info(`Seeding region "${REGION_NAME}"...`);
  const {
    result: [region],
  } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: REGION_NAME,
          currency_code: "usd",
          countries: [COUNTRY_CODE],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });

  // USD (default) and KHR, plus any currency another region still uses (for
  // example a demo region on staging). Medusa's first-boot store has EUR only
  // as a default, so a fresh shop ends with USD + KHR.
  const { data: allRegions } = await query.graph({
    entity: "region",
    fields: ["currency_code"],
  });
  const currencyCodes = new Set<string>([
    "usd",
    "khr",
    ...allRegions.map((r) => r.currency_code),
  ]);
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [...currencyCodes].map((currency_code) => ({
          currency_code,
          is_default: currency_code === "usd",
        })),
        default_region_id: region.id,
      },
    },
  });

  logger.info("Seeding tax region (no rate yet)...");
  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: COUNTRY_CODE, provider_id: "tp_system" }],
  });

  logger.info("Seeding stock location and Phnom Penh delivery...");
  const {
    result: [stockLocation],
  } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: "Phnom Penh",
          address: {
            city: "Phnom Penh",
            country_code: "KH",
            address_1: "",
          },
        },
      ],
    },
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  // Created by a core migration script on db:migrate.
  const {
    data: [shippingProfile],
  } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  if (!shippingProfile) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No shipping profile found. Run db:migrate first."
    );
  }

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Phnom Penh delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Cambodia",
        geo_zones: [{ country_code: COUNTRY_CODE, type: "country" }],
      },
    ],
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Phnom Penh Delivery",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Phnom Penh",
          description: "Delivery inside Phnom Penh.",
          code: "phnom-penh",
        },
        prices: [
          {
            currency_code: "usd",
            amount: PHNOM_PENH_DELIVERY_USD,
          },
          {
            region_id: region.id,
            amount: PHNOM_PENH_DELIVERY_USD,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [salesChannelId],
    },
  });

  logger.info(`Finished seeding "${REGION_NAME}".`);
}
