import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../modules/marketplace"

// Vendor stock (owner 2026-11-12, F-080: "track it"; TASKS P6-15). Each
// approved vendor has its own stock location (the vendor ↔ stock location
// link, P6-02), in the store's default sales channel, so checkout checks and
// reserves the vendor's stock there and fulfilment takes it from there.

/** The vendor's stock location, created (once) when missing. */
export async function ensureVendorStockLocation(
  container: MedusaContainer,
  vendorId: string
): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const find = async () => {
    const {
      data: [vendor],
    } = await query.graph({
      entity: "vendor",
      fields: ["id", "name", "stock_locations.id"],
      filters: { id: vendorId },
    })
    if (!vendor) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found.")
    }
    return vendor
  }
  const existing = (await find()).stock_locations?.[0]?.id
  if (existing) {
    return existing
  }
  // One at a time per vendor, so two calls can't make two locations.
  return container.resolve(Modules.LOCKING).execute(
    `vendor-stock-location:${vendorId}`,
    async () => {
      const vendor = await find()
      const again = vendor.stock_locations?.[0]?.id
      if (again) {
        return again
      }
      const {
        result: [location],
      } = await createStockLocationsWorkflow(container).run({
        input: { locations: [{ name: `Vendor: ${vendor.name}` }] },
      })
      await container.resolve(ContainerRegistrationKeys.LINK).create({
        [MARKETPLACE_MODULE]: { vendor_id: vendorId },
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      })
      const {
        data: [store],
      } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
      if (store?.default_sales_channel_id) {
        await linkSalesChannelsToStockLocationWorkflow(container).run({
          input: { id: location.id, add: [store.default_sales_channel_id] },
        })
      }
      return location.id
    },
    { timeout: 10, expire: 30 }
  )
}

/** The inventory item of each of these variants that tracks stock. */
export async function trackedInventoryItems(
  container: MedusaContainer,
  variantIds: string[]
): Promise<Record<string, string>> {
  if (!variantIds.length) {
    return {}
  }
  const { data: variants } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_variant",
    fields: ["id", "manage_inventory", "inventory_items.inventory_item_id"],
    filters: { id: variantIds },
  })
  return Object.fromEntries(
    variants
      .filter((v) => v.manage_inventory && v.inventory_items?.[0]?.inventory_item_id)
      .map((v) => [v.id, v.inventory_items![0]!.inventory_item_id])
  )
}

/** Sets an inventory item's stocked quantity at a location (creating the level). */
export async function setStock(
  container: MedusaContainer,
  inventoryItemId: string,
  locationId: string,
  quantity: number
) {
  const inventory = container.resolve(Modules.INVENTORY)
  const [level] = await inventory.listInventoryLevels({
    inventory_item_id: inventoryItemId,
    location_id: locationId,
  })
  if (level) {
    await inventory.updateInventoryLevels([
      { inventory_item_id: inventoryItemId, location_id: locationId, stocked_quantity: quantity },
    ])
  } else {
    await inventory.createInventoryLevels([
      { inventory_item_id: inventoryItemId, location_id: locationId, stocked_quantity: quantity },
    ])
  }
}

/** Stocked, reserved and available quantity of each item at a location. */
export async function stockAt(
  container: MedusaContainer,
  inventoryItemIds: string[],
  locationId: string
): Promise<Record<string, { stocked: number; reserved: number; available: number }>> {
  if (!inventoryItemIds.length) {
    return {}
  }
  const levels = await container
    .resolve(Modules.INVENTORY)
    .listInventoryLevels({ inventory_item_id: inventoryItemIds, location_id: locationId })
  return Object.fromEntries(
    levels.map((l) => {
      const stocked = Number(l.stocked_quantity)
      const reserved = Number(l.reserved_quantity)
      return [l.inventory_item_id, { stocked, reserved, available: Math.max(0, stocked - reserved) }]
    })
  )
}
