import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"
import ServiceContact from "@modules/checkout/components/service-contact"
import { isServiceOnlyCart } from "@lib/util/booking"

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) {
    return null
  }

  const shippingMethods = await listCartShippingMethods(cart.id)
  const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")

  if (!shippingMethods || !paymentMethods) {
    return null
  }

  return (
    <div className="w-full grid grid-cols-1 gap-y-8">
      {/* Booked services only (P3-13): contact instead of address and delivery. */}
      {isServiceOnlyCart(cart) ? (
        <ServiceContact cart={cart} />
      ) : (
        <>
          <Addresses cart={cart} customer={customer} />

          <Shipping cart={cart} availableShippingMethods={shippingMethods} />
        </>
      )}

      <Payment cart={cart} availablePaymentMethods={paymentMethods} />

      <Review cart={cart} />
    </div>
  )
}
