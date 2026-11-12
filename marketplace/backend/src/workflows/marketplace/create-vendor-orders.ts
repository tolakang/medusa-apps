import type { CreateOrderDTO, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  completeCartWorkflow,
  createRemoteLinkStep,
  releaseLockStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"

// Where a child order points at its parent, and the parent at its children
// (order metadata; the official Vendors example uses `parent_order_id`).
export const PARENT_ORDER_KEY = "parent_order_id"
export const CHILD_ORDERS_KEY = "child_order_ids"
// On a child order's item: the parent order item it was copied from.
export const PARENT_ITEM_KEY = "parent_line_item_id"

// What a child order copies from the parent (the example's prepareOrderData).
const PARENT_FIELDS = [
  "id",
  "region_id",
  "customer_id",
  "sales_channel_id",
  "email",
  "currency_code",
  "metadata",
  "shipping_address.*",
  "billing_address.*",
  "items.*",
  "items.tax_lines.*",
  "items.adjustments.*",
  "shipping_methods.*",
  "shipping_methods.tax_lines.*",
  "shipping_methods.adjustments.*",
]

type ParentOrder = Record<string, any>

const parentOrderStep = createStep(
  "vendor-orders-parent",
  async (orderId: string, { container }) => {
    const {
      data: [order],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: PARENT_FIELDS,
      filters: { id: orderId },
    })
    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${orderId} not found.`)
    }
    return new StepResponse(order as ParentOrder)
  }
)

// The parent's items grouped by vendor (the example's groupVendorItemsStep).
// Items whose product has no vendor are the marketplace's own and stay on
// the parent only.
const groupVendorItemsStep = createStep(
  "group-vendor-items",
  async (parent: ParentOrder, { container }) => {
    const productIds = [
      ...new Set((parent.items ?? []).map((i: any) => i.product_id).filter(Boolean)),
    ] as string[]
    if (!productIds.length) {
      return new StepResponse({} as Record<string, any[]>)
    }
    const { data: products } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "product",
        fields: ["id", "vendor.id"],
        filters: { id: productIds },
      })
    const vendorOf = new Map(products.map((p) => [p.id, p.vendor?.id]))
    const groups: Record<string, any[]> = {}
    for (const item of parent.items ?? []) {
      const vendorId = vendorOf.get(item.product_id)
      if (vendorId) {
        ;(groups[vendorId] ??= []).push(item)
      }
    }
    return new StepResponse(groups)
  }
)

const copyAddress = (address: any) => {
  if (!address) {
    return undefined
  }
  const { id, created_at, updated_at, deleted_at, ...rest } = address
  return rest
}

const copyTaxLines = (lines: any[] = []) =>
  lines.map((l) => ({
    code: l.code,
    rate: l.rate,
    description: l.description,
    tax_rate_id: l.tax_rate_id,
    provider_id: l.provider_id,
  }))

const copyAdjustments = (adjustments: any[] = []) =>
  adjustments.map((a) => ({
    code: a.code,
    amount: a.amount,
    description: a.description,
    promotion_id: a.promotion_id,
    provider_id: a.provider_id,
  }))

// One child order's data: a copy of the vendor's parent items (prices, taxes,
// discounts, product snapshot), and the parent's region, customer, channel,
// addresses and shipping methods.
export function childOrderData(parent: ParentOrder, items: any[]): CreateOrderDTO {
  return {
    region_id: parent.region_id,
    customer_id: parent.customer_id,
    sales_channel_id: parent.sales_channel_id,
    email: parent.email,
    currency_code: parent.currency_code,
    shipping_address: copyAddress(parent.shipping_address),
    billing_address: copyAddress(parent.billing_address),
    metadata: { [PARENT_ORDER_KEY]: parent.id },
    items: items.map((item) => ({
      title: item.title,
      subtitle: item.subtitle,
      thumbnail: item.thumbnail,
      quantity: item.quantity,
      product_id: item.product_id,
      product_title: item.product_title,
      product_description: item.product_description,
      product_subtitle: item.product_subtitle,
      product_type: item.product_type,
      product_collection: item.product_collection,
      product_handle: item.product_handle,
      variant_id: item.variant_id,
      variant_sku: item.variant_sku,
      variant_barcode: item.variant_barcode,
      variant_title: item.variant_title,
      variant_option_values: item.variant_option_values,
      requires_shipping: item.requires_shipping,
      is_discountable: item.is_discountable,
      is_tax_inclusive: item.is_tax_inclusive,
      compare_at_unit_price: item.compare_at_unit_price,
      unit_price: item.unit_price,
      metadata: { ...(item.metadata ?? {}), [PARENT_ITEM_KEY]: item.id },
      tax_lines: copyTaxLines(item.tax_lines),
      adjustments: copyAdjustments(item.adjustments),
    })),
    shipping_methods: (parent.shipping_methods ?? []).map((m: any) => ({
      name: m.name,
      amount: m.amount,
      is_tax_inclusive: m.is_tax_inclusive,
      shipping_option_id: m.shipping_option_id,
      data: m.data,
      tax_lines: copyTaxLines(m.tax_lines),
      adjustments: copyAdjustments(m.adjustments),
    })),
  } as CreateOrderDTO
}

type MovedReservation = {
  inventory_item_id: string
  location_id: string
  quantity: any
  from_line_item_id: string
  to_line_item_id: string
}

type CreatedChildren = {
  orderIds: string[]
  moved: MovedReservation[]
}

// Removes the children and the reservations made for them. The parent's own
// reservations are not put back: this only runs when the workflow fails, and
// then completeCartWorkflow's compensation removes the parent order and its
// reservations by their ids (re-creating them here left one behind, P6-05
// test "a failure while making child orders").
const undoChildOrders = async (container: MedusaContainer, created: CreatedChildren) => {
  if (created.moved.length) {
    await container
      .resolve(Modules.INVENTORY)
      .deleteReservationItemsByLineItem(created.moved.map((m) => m.to_line_item_id))
  }
  if (created.orderIds.length) {
    await container.resolve(Modules.ORDER).deleteOrders(created.orderIds)
  }
}

// One child order per vendor (the example's createVendorOrdersStep), always
// a child even for a single vendor, so the parent is never a vendor's order
// (F-076). The children are created with the Order Module itself, as copies
// of the parent's items: createOrderWorkflow re-checks stock after the parent
// has reserved it and refuses an order that takes a variant's last units
// (F-077). The parent's stock reservations move to the child items, so the
// vendor's fulfilment uses them. Compensation deletes the children and their
// reservations (plan §6.6); the parent is undone by completeCartWorkflow.
const createVendorOrdersStep = createStep(
  "create-vendor-orders",
  async (
    { parent, groups }: { parent: ParentOrder; groups: Record<string, any[]> },
    { container }
  ) => {
    const orders = container.resolve(Modules.ORDER)
    const inventory = container.resolve(Modules.INVENTORY)
    const children: { vendor_id: string; order_id: string }[] = []
    const created: CreatedChildren = { orderIds: [], moved: [] }
    try {
      for (const [vendorId, items] of Object.entries(groups)) {
        const [order] = await orders.createOrders([childOrderData(parent, items)])
        created.orderIds.push(order.id)
        children.push({ vendor_id: vendorId, order_id: order.id })

        const {
          data: [withItems],
        } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "order",
          fields: ["items.id", "items.metadata"],
          filters: { id: order.id },
        })
        const childItems = withItems?.items ?? []
        const childOf = new Map(
          childItems.map((i: any) => [i.metadata?.[PARENT_ITEM_KEY], i.id as string])
        )
        const parentItemIds = items.map((i) => i.id as string)
        const reservations = await inventory.listReservationItems({
          line_item_id: parentItemIds,
        })
        const moves: MovedReservation[] = reservations
          .filter((r) => r.line_item_id && childOf.has(r.line_item_id))
          .map((r) => ({
            inventory_item_id: r.inventory_item_id,
            location_id: r.location_id,
            quantity: r.quantity,
            from_line_item_id: r.line_item_id as string,
            to_line_item_id: childOf.get(r.line_item_id)!,
          }))
        if (moves.length) {
          // Free the parent's units first, then take the same units for the
          // child (allow_backorder: the units were just freed).
          await inventory.deleteReservationItems(
            reservations
              .filter((r) => r.line_item_id && childOf.has(r.line_item_id))
              .map((r) => r.id)
          )
          created.moved.push(...moves)
          await inventory.createReservationItems(
            moves.map((m) => ({
              line_item_id: m.to_line_item_id,
              inventory_item_id: m.inventory_item_id,
              location_id: m.location_id,
              quantity: m.quantity,
              allow_backorder: true,
            }))
          )
        }
      }
    } catch (e) {
      await undoChildOrders(container, created)
      throw e
    }
    return new StepResponse(children, created)
  },
  async (created, { container }) => {
    if (created) {
      await undoChildOrders(container, created)
    }
  }
)

// Records the children on the parent, so a retried call finds them instead
// of creating more (plan: "check for existing links first").
const markParentStep = createStep(
  "mark-parent-order",
  async (
    { parent, children }: { parent: ParentOrder; children: { order_id: string }[] },
    { container }
  ) => {
    const before = parent.metadata ?? {}
    await container.resolve(Modules.ORDER).updateOrders(parent.id, {
      metadata: { ...before, [CHILD_ORDERS_KEY]: children.map((c) => c.order_id) },
    })
    return new StepResponse(undefined, { id: parent.id, metadata: before })
  },
  async (previous, { container }) => {
    if (previous) {
      await container
        .resolve(Modules.ORDER)
        .updateOrders(previous.id, { metadata: previous.metadata })
    }
  }
)

export type CreateVendorOrdersResult = {
  parent_order_id: string
  child_orders: { vendor_id: string; order_id: string }[]
}

// The children already recorded on the parent, with their vendors.
const existingChildrenStep = createStep(
  "existing-vendor-orders",
  async (parent: ParentOrder, { container }) => {
    const ids = (parent.metadata?.[CHILD_ORDERS_KEY] ?? []) as string[]
    if (!ids.length) {
      return new StepResponse(null)
    }
    const { data: orders } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({ entity: "order", fields: ["id", "vendor.id"], filters: { id: ids } })
    return new StepResponse(
      orders.map((o) => ({ vendor_id: o.vendor?.id as string, order_id: o.id }))
    )
  }
)

// create-vendor-orders (BUILD_PLAN §6.6, TASKS P6-05), as in the official
// Vendors example: under a lock on the cart, completeCartWorkflow makes the
// parent order (the one the customer pays); then, unless the parent already
// has its children (a retried call), one child order per vendor (a copy of
// its items, holding their stock reservations), each linked to its vendor
// (P6-02).
export const createVendorOrdersWorkflow = createWorkflow(
  "create-vendor-orders",
  function (input: { cart_id: string }) {
    useQueryGraphStep({
      entity: "cart",
      fields: ["id"],
      filters: { id: input.cart_id },
      options: { throwIfKeyNotFound: true },
    })

    acquireLockStep({ key: input.cart_id, timeout: 2, ttl: 10 })

    const { id: parentOrderId } = completeCartWorkflow.runAsStep({
      input: { id: input.cart_id },
    })

    const parent = parentOrderStep(parentOrderId)
    const existing = existingChildrenStep(parent)

    const created = when({ existing }, ({ existing }) => !existing).then(() => {
      const groups = groupVendorItemsStep(parent)
      const children = createVendorOrdersStep({ parent, groups })
      const links = transform({ children }, ({ children }) =>
        children.map((c) => ({
          [MARKETPLACE_MODULE]: { vendor_id: c.vendor_id },
          [Modules.ORDER]: { order_id: c.order_id },
        }))
      )
      createRemoteLinkStep(links)
      markParentStep({ parent, children })
      return children
    })

    releaseLockStep({ key: input.cart_id })

    const result = transform(
      { parentOrderId, existing, created },
      ({ parentOrderId, existing, created }): CreateVendorOrdersResult => ({
        parent_order_id: parentOrderId,
        child_orders: existing ?? created ?? [],
      })
    )
    return new WorkflowResponse(result)
  }
)
