import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  associateLocationsWithSalesChannelsStep,
  createApiKeysStep,
  createRemoteLinkStep,
  createSalesChannelsStep,
  linkSalesChannelsToApiKeyStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { SELLER_MODULE } from "../../modules/seller"
import { createSellerStep, CreateSellerInput } from "./steps/create-seller"

/**
 * TASKS P5-02 (plan §6.5): a seller with their own sales channel and its
 * publishable key, linked one-to-one. The channel is linked to every stock
 * location, because you ship every seller's orders from your own stock.
 * Each step undoes itself if a later one fails.
 */
export const createSellerWorkflow = createWorkflow(
  "create-seller",
  function (input: CreateSellerInput) {
    const seller = createSellerStep(input)

    const channels = createSalesChannelsStep({
      data: [
        transform(input, (input) => ({
          name: `Seller: ${input.name}`,
          description: `Sales channel of seller "${input.handle}" (TASKS P5-02)`,
        })),
      ],
    })

    const keys = createApiKeysStep({
      api_keys: [
        transform(input, (input) => ({
          title: `Seller storefront: ${input.handle}`,
          type: "publishable" as const,
          created_by: "",
        })),
      ],
    })

    linkSalesChannelsToApiKeyStep(
      transform({ keys, channels }, ({ keys, channels }) => ({
        id: keys[0].id,
        add: [channels[0].id],
      }))
    )

    createRemoteLinkStep(
      transform({ seller, channels }, ({ seller, channels }) => [
        {
          [SELLER_MODULE]: { seller_id: seller.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: channels[0].id },
        },
      ])
    )

    const { data: locations } = useQueryGraphStep({
      entity: "stock_location",
      fields: ["id"],
    })
    associateLocationsWithSalesChannelsStep(
      transform({ locations, channels }, ({ locations, channels }) => ({
        links: locations.map((location) => ({
          sales_channel_id: channels[0].id,
          location_id: location.id,
        })),
      }))
    )

    return new WorkflowResponse(
      transform({ seller, channels, keys }, ({ seller, channels, keys }) => ({
        seller,
        sales_channel: channels[0],
        publishable_key: { id: keys[0].id, token: keys[0].token },
      }))
    )
  }
)
