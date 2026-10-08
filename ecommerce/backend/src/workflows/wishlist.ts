import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { WISHLIST_MODULE } from "../modules/wishlist"
import type WishlistModuleService from "../modules/wishlist/service"

// Wishlist workflows (TASKS P1-19), following the official guide "How to Build
// a Wishlist Plugin" (resources/plugins/guides/wishlist) with these changes:
// the wishlist is created on the first "add" instead of by a separate call;
// it is always looked up by customer AND sales channel (the guide's unique
// index, while its lookups used the customer only); a missing variant is a
// clear 404 instead of a crash. The guide's customer check is kept: a sign-in
// whose customer was deleted gets a 404 instead of an orphan wishlist.

export const WISHLIST_FIELDS = [
  "id",
  "sales_channel_id",
  "items.id",
  "items.product_variant_id",
  "items.created_at",
  "items.product_variant.id",
  "items.product_variant.title",
  "items.product_variant.product_id",
  "items.product_variant.product.id",
  "items.product_variant.product.title",
  "items.product_variant.product.handle",
  "items.product_variant.product.thumbnail",
]

type Owner = { customer_id: string; sales_channel_id: string }

// The customer's wishlist in this sales channel, created when missing. Two
// first adds at the same moment: the unique index refuses the second wishlist,
// which then reads the one just created.
const getOrCreateWishlistStep = createStep(
  "get-or-create-wishlist",
  async (input: Owner, { container }) => {
    const service: WishlistModuleService = container.resolve(WISHLIST_MODULE)
    const [existing] = await service.listWishlists(input)
    if (existing) {
      return new StepResponse({ id: existing.id }, null)
    }
    try {
      const created = await service.createWishlists(input)
      return new StepResponse({ id: created.id }, created.id)
    } catch (e) {
      const [saved] = await service.listWishlists(input)
      if (saved) {
        return new StepResponse({ id: saved.id }, null)
      }
      throw e
    }
  },
  async (createdId: string | null, { container }) => {
    if (!createdId) {
      return
    }
    const service: WishlistModuleService = container.resolve(WISHLIST_MODULE)
    await service.deleteWishlists(createdId)
  }
)

// The signed-in customer still exists (guide "validate-customer-create-wishlist").
const validateCustomerStep = createStep(
  "validate-wishlist-customer",
  async (input: { customer_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [customer],
    } = await query.graph({ entity: "customer", fields: ["id"], filters: { id: input.customer_id } })
    if (!customer) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer was not found. Please sign in again.")
    }
  }
)

// The variant exists and its product is sold in this sales channel (guide
// "validate-variant-wishlist").
const validateVariantStep = createStep(
  "validate-variant",
  async (input: { variant_id: string; sales_channel_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [variant],
    } = await query.graph({
      entity: "variant",
      fields: ["id", "product.sales_channels.id"],
      filters: { id: input.variant_id },
    })
    if (!variant) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${input.variant_id} was not found.`)
    }
    const channels = (variant.product?.sales_channels ?? []) as { id: string }[]
    if (!channels.some((channel) => channel?.id === input.sales_channel_id)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This product is not available in this store."
      )
    }
  }
)

// Adds the variant once; adding it again keeps the existing item.
const addWishlistItemStep = createStep(
  "add-wishlist-item",
  async (input: { wishlist_id: string; product_variant_id: string }, { container }) => {
    const service: WishlistModuleService = container.resolve(WISHLIST_MODULE)
    const [existing] = await service.listWishlistItems({
      wishlist_id: input.wishlist_id,
      product_variant_id: input.product_variant_id,
    })
    if (existing) {
      return new StepResponse(existing.id, null)
    }
    try {
      const item = await service.createWishlistItems({
        wishlist_id: input.wishlist_id,
        product_variant_id: input.product_variant_id,
      })
      return new StepResponse(item.id, item.id)
    } catch (e) {
      const [saved] = await service.listWishlistItems({
        wishlist_id: input.wishlist_id,
        product_variant_id: input.product_variant_id,
      })
      if (saved) {
        return new StepResponse(saved.id, null)
      }
      throw e
    }
  },
  async (createdId: string | null, { container }) => {
    if (!createdId) {
      return
    }
    const service: WishlistModuleService = container.resolve(WISHLIST_MODULE)
    await service.deleteWishlistItems(createdId)
  }
)

export const addWishlistItemWorkflow = createWorkflow(
  "add-wishlist-item",
  function (input: Owner & { variant_id: string }) {
    validateCustomerStep({ customer_id: input.customer_id })
    validateVariantStep({ variant_id: input.variant_id, sales_channel_id: input.sales_channel_id })
    const wishlist = getOrCreateWishlistStep({
      customer_id: input.customer_id,
      sales_channel_id: input.sales_channel_id,
    })
    const itemInput = transform({ wishlist, input }, ({ wishlist, input }) => ({
      wishlist_id: wishlist.id,
      product_variant_id: input.variant_id,
    }))
    addWishlistItemStep(itemInput)
    const { data: wishlists } = useQueryGraphStep({
      entity: "wishlist",
      fields: WISHLIST_FIELDS,
      filters: { id: wishlist.id },
    }).config({ name: "refetch-wishlist-after-add" })
    return new WorkflowResponse(transform({ wishlists }, ({ wishlists }) => wishlists[0]))
  }
)

// Removes an item, only from the customer's own wishlist in this channel
// (guide "validate-item-in-wishlist"). Soft delete, restored on rollback.
const removeWishlistItemStep = createStep(
  "remove-wishlist-item",
  async (input: Owner & { item_id: string }, { container }) => {
    const service: WishlistModuleService = container.resolve(WISHLIST_MODULE)
    const [wishlist] = await service.listWishlists(
      { customer_id: input.customer_id, sales_channel_id: input.sales_channel_id },
      { relations: ["items"] }
    )
    if (!wishlist?.items?.some((item) => item.id === input.item_id)) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "This item is not in your wishlist.")
    }
    await service.softDeleteWishlistItems(input.item_id)
    return new StepResponse({ wishlist_id: wishlist.id }, input.item_id)
  },
  async (itemId: string | undefined, { container }) => {
    if (!itemId) {
      return
    }
    const service: WishlistModuleService = container.resolve(WISHLIST_MODULE)
    await service.restoreWishlistItems([itemId])
  }
)

export const removeWishlistItemWorkflow = createWorkflow(
  "remove-wishlist-item",
  function (input: Owner & { item_id: string }) {
    const removed = removeWishlistItemStep(input)
    const { data: wishlists } = useQueryGraphStep({
      entity: "wishlist",
      fields: WISHLIST_FIELDS,
      filters: { id: removed.wishlist_id },
    }).config({ name: "refetch-wishlist-after-remove" })
    return new WorkflowResponse(transform({ wishlists }, ({ wishlists }) => wishlists[0]))
  }
)
