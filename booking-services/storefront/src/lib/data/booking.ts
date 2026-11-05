"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { getAuthHeaders, getCacheTag, getCartId } from "./cookies"
import { getOrSetCart, retrieveCart } from "./cart"

// Booking calls of the storefront (TASKS P3-13), against the backend's
// /store/booking/* routes (P3-10) and /store/customers/me/bookings.

export type Slot = {
  resource_id: string
  resource_name?: string
  timezone?: string
  starts_at: string
  ends_at: string
  remaining: number
}

export type MyBooking = {
  id: string
  status: string
  starts_at: string
  ends_at: string
  notes: string | null
  resource: { name: string; timezone: string } | null
  order: { id: string; display_id: number | null } | null
}

export async function listSlots(variantId: string, date: string): Promise<{ slots: Slot[]; error?: string }> {
  return sdk.client
    .fetch<{ slots: Slot[] }>("/store/booking/slots", {
      query: { variant_id: variantId, date },
      headers: await getAuthHeaders(),
      cache: "no-store",
    })
    .then((r) => ({ slots: r.slots }))
    .catch((e) => ({ slots: [], error: e?.message ?? "Could not load times." }))
}

export async function addBookingToCart(input: {
  countryCode: string
  variantId: string
  slot: Slot
}): Promise<{ error?: string }> {
  const cart = await getOrSetCart(input.countryCode)
  if (!cart) {
    return { error: "Could not open your cart." }
  }
  try {
    await sdk.client.fetch("/store/booking/cart", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: {
        cart_id: cart.id,
        variant_id: input.variantId,
        resource_id: input.slot.resource_id,
        starts_at: input.slot.starts_at,
        ends_at: input.slot.ends_at,
      },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "This time can't be booked." }
  }
  revalidateTag(await getCacheTag("carts"))
  return {}
}

// Checkout contact for a cart of services (no delivery): name, email and
// phone on the cart and both addresses (the backend's contact rule reads
// the email or the shipping address phone, F-048).
export async function setServiceContact(_state: unknown, formData: FormData): Promise<string | null> {
  const cartId = await getCartId()
  if (!cartId) {
    return "No cart found."
  }
  const cart = await retrieveCart(cartId)
  const email = String(formData.get("email") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  if (!email) {
    return "Add your email so we can send the confirmation and a reminder."
  }
  const address = {
    first_name: String(formData.get("first_name") ?? "").trim(),
    last_name: String(formData.get("last_name") ?? "").trim(),
    phone,
    country_code: cart?.shipping_address?.country_code ?? cart?.region?.countries?.[0]?.iso_2 ?? undefined,
  }
  try {
    await sdk.store.cart.update(
      cartId,
      { email, shipping_address: address, billing_address: address },
      {},
      await getAuthHeaders()
    )
  } catch (e) {
    return (e as { message?: string })?.message ?? "Could not save your details."
  }
  revalidateTag(await getCacheTag("carts"))
  redirect(`/${String(formData.get("country_code") ?? "")}/checkout?step=payment`)
}

export async function listMyBookings(): Promise<MyBooking[] | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return null
  }
  return sdk.client
    .fetch<{ bookings: MyBooking[] }>("/store/customers/me/bookings", { headers, cache: "no-store" })
    .then((r) => r.bookings)
    .catch(medusaError)
}

export async function cancelMyBooking(
  bookingId: string
): Promise<{ refund?: string; refunded_amount?: number; error?: string }> {
  try {
    return await sdk.client.fetch<{ refund: string; refunded_amount: number }>("/store/booking/cancel", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: { booking_id: bookingId },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not cancel this booking." }
  }
}
