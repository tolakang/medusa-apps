import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"
import { formatDate } from "@lib/util/format-date"
import { bookingStatusLabel, isServiceOnlyCart } from "@lib/util/booking"

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
  // Statuses of the order's bookings (P3-13).
  bookingStatuses?: string[]
}

const OrderDetails = ({ order, showStatus, bookingStatuses }: OrderDetailsProps) => {
  // A service-only order is never shipped: its booking status matters, not
  // the fulfilment status ("Not fulfilled") (P3-13).
  const serviceOnly = isServiceOnlyCart(order)
  const formatStatus = (str: string) => {
    const formatted = str.split("_").join(" ")

    return formatted.slice(0, 1).toUpperCase() + formatted.slice(1)
  }

  return (
    <div>
      {/* Email is optional at checkout (TASKS P1-16). */}
      {order.email ? (
        <Text>
          We have sent the order confirmation details to{" "}
          <span
            className="text-ui-fg-medium-plus font-semibold"
            data-testid="order-email"
          >
            {order.email}
          </span>
          .
        </Text>
      ) : (
        <Text>
          Thank you. We will contact you by phone about your delivery.
        </Text>
      )}
      <Text className="mt-2">
        Order date:{" "}
        <span data-testid="order-date">
          {formatDate(order.created_at)}
        </span>
      </Text>
      <Text className="mt-2 text-ui-fg-interactive">
        Order number: <span data-testid="order-id">{order.display_id}</span>
      </Text>

      <div className="flex items-center text-compact-small gap-x-4 mt-4">
        {showStatus && (
          <>
            {serviceOnly ? (
              <Text>
                Booking status:{" "}
                <span className="text-ui-fg-subtle " data-testid="order-booking-status">
                  {bookingStatusLabel(bookingStatuses ?? [], order.status)}
                </span>
              </Text>
            ) : (
              <Text>
                Order status:{" "}
                <span className="text-ui-fg-subtle " data-testid="order-status">
                  {formatStatus(order.fulfillment_status)}
                </span>
              </Text>
            )}
            <Text>
              Payment status:{" "}
              <span
                className="text-ui-fg-subtle "
                sata-testid="order-payment-status"
              >
                {formatStatus(order.payment_status)}
              </span>
            </Text>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderDetails
