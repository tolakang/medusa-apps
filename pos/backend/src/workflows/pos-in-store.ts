import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, createShippingOptionsWorkflow, releaseLockStep } from "@medusajs/medusa/core-flows"

// The shop's "In store (POS)" shipping option (TASKS P2-11). A counter sale
// is fulfilled at once from the register's stock location, which is what
// takes the stock out (createOrderFulfillmentWorkflow subtracts the fulfilled
// quantity from that location's stocked quantity, docs "Reservations
// Lifecycle"). Medusa fulfills only with a shipping option, so each location
// a register sells from gets one: a pickup fulfillment set with a service
// zone that has no geo zones (it matches no address), and an option with the
// rule enabled_in_store = "false", which the storefront's shipping-option
// list filters out (list-shipping-options-for-cart passes enabled_in_store
// "true"). Same pattern as the Cambodia seed's delivery option.

export const POS_IN_STORE_CODE = "pos-in-store"

type Created = { location_id: string; set_id?: string; provider_link?: boolean; set_link?: boolean }

type Prepared = {
  shipping_option_id: string | null
  service_zone_id: string | null
  shipping_profile_id: string | null
  currencies: string[]
}

// Finds the location's in-store option, or creates what the option needs.
const preparePosInStoreStep = createStep(
  "prepare-pos-in-store",
  async (input: { stock_location_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [location],
    } = await query.graph({
      entity: "stock_location",
      fields: [
        "id",
        "name",
        "fulfillment_providers.id",
        "fulfillment_sets.id",
        "fulfillment_sets.type",
        "fulfillment_sets.service_zones.id",
        "fulfillment_sets.service_zones.shipping_options.id",
        "fulfillment_sets.service_zones.shipping_options.type.code",
      ],
      filters: { id: input.stock_location_id },
    })
    if (!location) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Stock location ${input.stock_location_id} was not found.`)
    }
    for (const set of location.fulfillment_sets ?? []) {
      for (const zone of set?.service_zones ?? []) {
        const option = (zone?.shipping_options ?? []).find((o) => o?.type?.code === POS_IN_STORE_CODE)
        if (option) {
          // Nothing created, so nothing to undo.
          return new StepResponse<Prepared, Created>(
            {
              shipping_option_id: option.id,
              service_zone_id: zone!.id,
              shipping_profile_id: null,
              currencies: [],
            },
            { location_id: location.id }
          )
        }
      }
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const created: Created = { location_id: location.id }
    const hasManual = (location.fulfillment_providers ?? []).some((p) => p?.id === "manual_manual")
    if (!hasManual) {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
      })
      created.provider_link = true
    }
    const fulfillment = container.resolve(Modules.FULFILLMENT)
    const set = await fulfillment.createFulfillmentSets({
      name: `In store (POS) · ${location.name} · ${location.id}`,
      type: "pickup",
      service_zones: [{ name: "In store", geo_zones: [] }],
    })
    created.set_id = set.id
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
    })
    created.set_link = true

    const [profile] = await fulfillment.listShippingProfiles({ type: "default" })
    if (!profile) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "No default shipping profile. Run db:migrate first.")
    }
    const [store] = await container.resolve(Modules.STORE).listStores({}, { relations: ["supported_currencies"] })
    const currencies = (store?.supported_currencies ?? []).map((c) => c.currency_code)

    return new StepResponse<Prepared, Created>(
      {
        shipping_option_id: null,
        service_zone_id: set.service_zones[0].id,
        shipping_profile_id: profile.id,
        currencies,
      },
      created
    )
  },
  async (created: Created | undefined, { container }) => {
    if (!created) {
      return
    }
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    if (created.set_id) {
      if (created.set_link) {
        await link.dismiss({
          [Modules.STOCK_LOCATION]: { stock_location_id: created.location_id },
          [Modules.FULFILLMENT]: { fulfillment_set_id: created.set_id },
        })
      }
      await container.resolve(Modules.FULFILLMENT).deleteFulfillmentSets(created.set_id)
    }
    if (created.provider_link) {
      await link.dismiss({
        [Modules.STOCK_LOCATION]: { stock_location_id: created.location_id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
      })
    }
  }
)

export const ensurePosInStoreOptionWorkflow = createWorkflow(
  "ensure-pos-in-store-option",
  function (input: { stock_location_id: string }) {
    // Two registers on one location set up at the same moment create one option.
    const lockKey = transform({ input }, ({ input }) => `pos-in-store:${input.stock_location_id}`)
    acquireLockStep({ key: lockKey, timeout: 10, ttl: 60 })
    const prepared = preparePosInStoreStep(input)

    const created = when("pos-in-store-missing", { prepared }, ({ prepared }) => !prepared.shipping_option_id).then(
      () => {
        const optionInput = transform({ prepared }, ({ prepared }) => [
          {
            name: "In store (POS)",
            price_type: "flat" as const,
            provider_id: "manual_manual",
            service_zone_id: prepared.service_zone_id!,
            shipping_profile_id: prepared.shipping_profile_id!,
            type: {
              label: "In store",
              description: "Sold and handed over at the shop counter.",
              code: POS_IN_STORE_CODE,
            },
            prices: prepared.currencies.map((currency_code) => ({ currency_code, amount: 0 })),
            rules: [
              { attribute: "enabled_in_store", value: "false", operator: "eq" as const },
              { attribute: "is_return", value: "false", operator: "eq" as const },
            ],
          },
        ])
        return createShippingOptionsWorkflow.runAsStep({ input: optionInput })
      }
    )
    releaseLockStep({ key: lockKey })

    const result = transform({ prepared, created }, ({ prepared, created }) => ({
      shipping_option_id: (prepared.shipping_option_id ?? created?.[0]?.id) as string,
    }))
    return new WorkflowResponse(result)
  }
)
