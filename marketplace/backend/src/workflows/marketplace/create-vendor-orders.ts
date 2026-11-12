import { randomUUID } from "node:crypto"
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
import { itemsValue, splitShipping } from "../../lib/shipping-split"
import { recordVendorCommissionsWorkflow } from "./record-vendor-commission"

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

// A child's share of each parent shipping method: the amount and each
// adjustment, in order (F-076, src/lib/shipping-split.ts).
export type ShippingShare = { amount: number; adjustments: number[] }

// Every vendor's shipping shares, in the order of `vendorItems`.
export function vendorShippingShares(parent: ParentOrder, vendorItems: any[][]): ShippingShare[][] {
  const orderValue = itemsValue(parent.items ?? [])
  const values = vendorItems.map((items) => itemsValue(items))
  const perMethod = (parent.shipping_methods ?? []).map((m: any) => ({
    amount: splitShipping(m.amount, values, orderValue),
    adjustments: (m.adjustments ?? []).map((a: any) => splitShipping(a.amount, values, orderValue)),
  }))
  return vendorItems.map((_, v) =>
    perMethod.map((m: { amount: number[]; adjustments: number[][] }) => ({
      amount: m.amount[v],
      adjustments: m.adjustments.map((a) => a[v]),
    }))
  )
}

// One child order's data: a copy of the vendor's parent items (prices, taxes,
// discounts, product snapshot), the parent's region, customer, channel and
// addresses, and the parent's shipping methods with the vendor's share of
// their amounts (owner: "Split across vendors", F-076).
export function childOrderData(
  parent: ParentOrder,
  items: any[],
  shipping: ShippingShare[]
): CreateOrderDTO {
  return {
    region_id: parent.region_id,
    // No customer_id: a customer's account lists the orders they placed
    // (the parent), not the vendors' copies (TASKS P6-08). The email and
    // addresses are kept for the vendor's delivery.
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
    shipping_methods: (parent.shipping_methods ?? []).map((m: any, i: number) => ({
      name: m.name,
      amount: shipping[i].amount,
      is_tax_inclusive: m.is_tax_inclusive,
      shipping_option_id: m.shipping_option_id,
      data: m.data,
      tax_lines: copyTaxLines(m.tax_lines),
      adjustments: copyAdjustments(m.adjustments).map((a, j) => ({
        ...a,
        amount: shipping[i].adjustments[j],
      })),
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
  // Put the parent's reservations back when undoing (review 2, S1).
  restoreParent: boolean
}

// Removes the children and the reservations made for them. When this run
// also made the parent (complete-vendor on a cart that wasn't complete yet),
// the parent's reservations are not put back: completeCartWorkflow's
// compensation removes the parent order and its reservations by their ids
// (re-creating them here left one behind, P6-05 test "a failure while making
// child orders"). Otherwise the paid parent stays, so its reservations are
// re-created from the moves; without them its units went back on sale and a
// retried split gave the children none (review 2, S1).
const undoChildOrders = async (container: MedusaContainer, created: CreatedChildren) => {
  const inventory = container.resolve(Modules.INVENTORY)
  if (created.moved.length) {
    await inventory.deleteReservationItemsByLineItem(created.moved.map((m) => m.to_line_item_id))
    if (created.restoreParent) {
      await inventory.createReservationItems(
        created.moved.map((m) => ({
          line_item_id: m.from_line_item_id,
          inventory_item_id: m.inventory_item_id,
          location_id: m.location_id,
          quantity: m.quantity,
          allow_backorder: true,
        }))
      )
    }
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
    {
      parent,
      groups,
      restoreParent,
    }: { parent: ParentOrder; groups: Record<string, any[]>; restoreParent: boolean },
    { container }
  ) => {
    const orders = container.resolve(Modules.ORDER)
    const inventory = container.resolve(Modules.INVENTORY)
    const children: { vendor_id: string; order_id: string }[] = []
    const created: CreatedChildren = { orderIds: [], moved: [], restoreParent }
    try {
      const entries = Object.entries(groups)
      const shares = vendorShippingShares(
        parent,
        entries.map(([, items]) => items)
      )
      for (const [index, [vendorId, items]] of entries.entries()) {
        const [order] = await orders.createOrders([
          childOrderData(parent, items, shares[index]),
        ])
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

// split-vendor-order (TASKS P6-05, P6-08, F-079): one parent order's vendor
// child orders, under a lock on the order, unless it already has them. Both
// ways an order is placed run it: create-vendor-orders (the storefront's
// complete-vendor) and the order.placed subscriber (a cart completed any
// other way, e.g. by PayWay's webhook before the customer comes back). The
// lock and the parent's child_order_ids keep them from making two sets.
// `parent_created_here`: complete-vendor made the parent in the same run, so
// its own compensation removes the parent (see undoChildOrders).
export const splitVendorOrderWorkflow = createWorkflow(
  "split-vendor-order",
  function (input: { order_id: string; parent_created_here?: boolean }) {
    const key = transform(input, (i) => `vendor-split:${i.order_id}`)
    const ownerId = transform(input, () => `vendor-split:${randomUUID()}`)
    acquireLockStep({ key, ownerId, timeout: 10, ttl: 30 })

    const parent = parentOrderStep(input.order_id)
    const existing = existingChildrenStep(parent)

    const created = when("create-vendor-children", { existing }, ({ existing }) => !existing).then(() => {
      const groups = groupVendorItemsStep(parent)
      const restoreParent = transform(input, (i) => !i.parent_created_here)
      const children = createVendorOrdersStep({ parent, groups, restoreParent })
      const links = transform({ children }, ({ children }) =>
        children.map((c) => ({
          [MARKETPLACE_MODULE]: { vendor_id: c.vendor_id },
          [Modules.ORDER]: { order_id: c.order_id },
        }))
      )
      createRemoteLinkStep(links)
      markParentStep({ parent, children })
      // record-vendor-commission for the children (TASKS P6-06).
      const orderIds = transform({ children }, ({ children }) =>
        children.map((c) => c.order_id)
      )
      recordVendorCommissionsWorkflow.runAsStep({ input: { order_ids: orderIds } })
      return children
    })

    releaseLockStep({ key, ownerId })

    const result = transform(
      { input, existing, created },
      ({ input, existing, created }): CreateVendorOrdersResult => ({
        parent_order_id: input.order_id,
        child_orders: existing ?? created ?? [],
      })
    )
    return new WorkflowResponse(result)
  }
)

// create-vendor-orders (BUILD_PLAN §6.6, TASKS P6-05), as in the official
// Vendors example: under a lock on the cart, completeCartWorkflow makes the
// parent order (the one the customer pays); then split-vendor-order makes
// one child order per vendor (a copy of its items, holding their stock
// reservations), each linked to its vendor (P6-02), unless the parent
// already has them (a retried call, or the order.placed subscriber was
// first).
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

    // Already completed (e.g. by PayWay's webhook): completeCartWorkflow
    // returns the existing order and won't undo it.
    const { data: cartState } = useQueryGraphStep({
      entity: "cart",
      fields: ["id", "completed_at"],
      filters: { id: input.cart_id },
    }).config({ name: "vendor-orders-cart-state" })

    const { id: parentOrderId } = completeCartWorkflow.runAsStep({
      input: { id: input.cart_id },
    })

    const splitInput = transform({ cartState, parentOrderId }, ({ cartState, parentOrderId }) => ({
      order_id: parentOrderId,
      parent_created_here: !cartState?.[0]?.completed_at,
    }))
    const split = splitVendorOrderWorkflow.runAsStep({ input: splitInput })

    releaseLockStep({ key: input.cart_id })

    return new WorkflowResponse(split)
  }
)
