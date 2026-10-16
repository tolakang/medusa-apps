import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// Test helpers for shop stock (TASKS P2-11): put a variant's inventory at a
// location, and read a location's stocked / reserved quantity.

async function inventoryItemId(container: MedusaContainer, variantId: string): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "inventory_items.inventory_item_id"],
    filters: { id: variantId },
  })
  const id = variant?.inventory_items?.[0]?.inventory_item_id
  if (!id) {
    throw new Error(`Variant ${variantId} has no inventory item`)
  }
  return id
}

export async function stockAt(container: MedusaContainer, variantId: string, locationId: string, quantity: number) {
  const inventory = container.resolve(Modules.INVENTORY)
  const itemId = await inventoryItemId(container, variantId)
  const [level] = await inventory.listInventoryLevels({ inventory_item_id: itemId, location_id: locationId })
  if (level) {
    await inventory.updateInventoryLevels([{ inventory_item_id: itemId, location_id: locationId, stocked_quantity: quantity }])
  } else {
    await inventory.createInventoryLevels([{ inventory_item_id: itemId, location_id: locationId, stocked_quantity: quantity }])
  }
}

export async function levelAt(container: MedusaContainer, variantId: string, locationId: string) {
  const inventory = container.resolve(Modules.INVENTORY)
  const itemId = await inventoryItemId(container, variantId)
  const [level] = await inventory.listInventoryLevels({ inventory_item_id: itemId, location_id: locationId })
  return { stocked: Number(level?.stocked_quantity ?? 0), reserved: Number(level?.reserved_quantity ?? 0) }
}
