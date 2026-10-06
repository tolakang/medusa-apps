"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { FetchError } from "@medusajs/js-sdk"
import { MIN_PASSWORD_LENGTH } from "@lib/util/password"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  getPendingCustomer,
  removeAuthToken,
  removeCartId,
  removePendingCustomer,
  setAuthToken,
  setPendingCustomer,
  getPendingAuth,
  removePendingAuth,
  setPendingAuth,
} from "./cookies"

// What the sign-in / sign-up forms show after a submit (owner, 2026-10-06):
// the typed values come back so the form keeps them (React resets form
// fields after an action), and each outcome has its own screen.
export type AuthFormValues = {
  email?: string
  first_name?: string
  last_name?: string
  phone?: string
}
export type VerificationSent = "sent" | "recent" | "failed"
export type CustomerAuthState =
  | { state: "error"; error: string; values?: AuthFormValues }
  | { state: "exists"; email: string; values?: AuthFormValues }
  | { state: "verification_required"; email: string; sent: VerificationSent }
  | { state: "complete_profile"; email: string }
  | { state: "success" }
  | null

// Medusa's messages, worded for customers (no "Error:" prefix).
function friendlyAuthError(error: unknown): string {
  const message = String((error as Error)?.message ?? error ?? "").replace(/^Error:\s*/, "")
  if (/invalid email or password|unauthorized/i.test(message)) {
    return "The email or password is incorrect."
  }
  return message || "Something went wrong. Please try again."
}

// Requests a verification email for the given customer. The request must be
// authenticated with a token tied to the auth identity (the token returned by
// register or by a login that requires verification). The backend sends at
// most one per address every 2 minutes (429).
async function requestVerificationEmail(email: string, token: string): Promise<VerificationSent> {
  try {
    await sdk.auth.verification.request(
      {
        entity_id: email,
        entity_type: "email",
      },
      {
        authorization: `Bearer ${token}`,
      }
    )
    return "sent"
  } catch (error) {
    return (error as FetchError)?.status === 429 ? "recent" : "failed"
  }
}

// "Resend link" on the "verify your email" screen, using the token kept from
// the sign-in (no password needed).
export async function resendVerificationEmail(): Promise<VerificationSent> {
  const pending = await getPendingAuth()
  if (!pending) {
    return "failed"
  }
  return requestVerificationEmail(pending.email, pending.token)
}

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    const authHeaders = await getAuthHeaders()

    if (!authHeaders) return null

    const headers = {
      ...authHeaders,
    }

    const next = {
      ...(await getCacheOptions("customers")),
    }

    return await sdk.client
      .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
        method: "GET",
        query: {
          fields: "*orders",
        },
        headers,
        next,
        cache: "force-cache",
      })
      .then(({ customer }) => customer)
      .catch(() => null)
  }

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const updateRes = await sdk.store.customer
    .update(body, {}, headers)
    .then(({ customer }) => customer)
    .catch(medusaError)

  const cacheTag = await getCacheTag("customers")
  revalidateTag(cacheTag)

  return updateRes
}

export async function signup(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const password = formData.get("password") as string
  const customerForm = {
    email: formData.get("email") as string,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    phone: formData.get("phone") as string,
  }

  const captchaToken = String(formData.get("captcha_token") ?? "")
  let registrationToken = ""
  try {
    registrationToken = await sdk.auth.register("customer", "emailpass", {
      email: customerForm.email,
      password,
      // Checked by the backend's CAPTCHA middleware (TASKS P1-21).
      captcha_token: captchaToken,
    })
  } catch (error) {
    const fetchError = error as FetchError
    // An existing identity (an earlier sign-up, or an admin user with the
    // same email) is handled below by signing in. Any other error is shown.
    if (
      fetchError.statusText !== "Unauthorized" ||
      fetchError.message !== "Identity with email already exists"
    ) {
      return { state: "error", error: friendlyAuthError(error), values: customerForm }
    }
    // The email already has an account: offer sign-in / reset instead.
    return { state: "exists", email: customerForm.email, values: customerForm }
  }

  // Persist the extra signup fields; the customer record is created at the
  // first sign-in after email verification. The verification email is sent
  // with the token from registration (no second sign-in, so the single-use
  // CAPTCHA token is spent once).
  await setPendingCustomer(customerForm)
  await setPendingAuth({ email: customerForm.email, token: registrationToken })
  const sent = await requestVerificationEmail(customerForm.email, registrationToken)
  return { state: "verification_required", email: customerForm.email, sent }
}

export async function login(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  const captchaToken = String(formData.get("captcha_token") ?? "")
  const result = await completeLogin(email, password, captchaToken)
  return result?.state === "error" ? { ...result, values: { email } } : result
}

// Logs the customer in and reconciles the customer record. The behavior is
// driven entirely by the backend's login response, so it works whether or not
// email verification is enabled.
async function completeLogin(
  email: string,
  password: string,
  captchaToken: string
): Promise<CustomerAuthState> {
  let result: Awaited<ReturnType<typeof sdk.auth.login>>

  try {
    result = await sdk.auth.login("customer", "emailpass", {
      email,
      password,
      // Checked by the backend's CAPTCHA middleware (TASKS P1-21).
      captcha_token: captchaToken,
    })
  } catch (error) {
    return { state: "error", error: friendlyAuthError(error) }
  }

  // A `location` is returned by third-party auth providers, which this flow
  // doesn't support.
  if (typeof result === "object" && "location" in result) {
    return {
      state: "error",
      error: "This login method isn't supported by the storefront.",
    }
  }

  // The backend requires email verification and the customer hasn't verified
  // yet. Send the verification email and ask them to check their inbox.
  if (
    typeof result === "object" &&
    "verification_required" in result &&
    result.verification_required
  ) {
    await setPendingAuth({ email, token: result.token })
    const sent = await requestVerificationEmail(email, result.token)
    return { state: "verification_required", email, sent }
  }

  if (typeof result !== "string") {
    return {
      state: "error",
      error: "Authentication requires additional steps that aren't supported.",
    }
  }

  let token = result

  // The token may not be tied to a customer record yet — right after
  // registration, or after verifying a brand-new account. Ask the backend:
  // `/store/customers/me` rejects tokens without a registered actor, so a
  // failed retrieve means we still need to create the customer, then log in
  // again to obtain a customer-bound token.
  const customerExists = await sdk.store.customer
    .retrieve({}, { authorization: `Bearer ${token}` })
    .then(() => true)
    .catch(() => false)

  if (!customerExists) {
    const pending = await getPendingCustomer()

    // No sign-up details on this device (verified on another device, or more
    // than a day later): ask for them instead of creating a nameless account.
    if (!pending || pending.email?.toLowerCase() !== email.toLowerCase()) {
      await setPendingAuth({ email, token })
      return { state: "complete_profile", email }
    }

    try {
      await sdk.store.customer.create(
        {
          email,
          first_name: pending?.first_name,
          last_name: pending?.last_name,
          phone: pending?.phone,
        },
        {},
        { authorization: `Bearer ${token}` }
      )

      // A token that carries the new customer, without signing in again
      // (the CAPTCHA token is single-use): POST /auth/token/refresh.
      token = (
        await sdk.client.fetch<{ token: string }>("/auth/token/refresh", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        })
      ).token
    } catch (error) {
      return { state: "error", error: friendlyAuthError(error) }
    }

    await removePendingCustomer()
  }

  await setAuthToken(token)

  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag)

  await removePendingAuth()

  try {
    await transferCart()
  } catch (error) {
    return { state: "error", error: friendlyAuthError(error) }
  }

  return { state: "success" }
}

// "Complete your profile" (owner, 2026-10-06): create the customer record
// with the sign-in token kept from completeLogin, then refresh the token so
// it carries the customer (POST /auth/token/refresh; docs "Third-Party or
// Social Login in Storefront"), without asking for the password again.
export async function completeProfile(
  _currentState: unknown,
  formData: FormData
): Promise<{ state: "error"; error: string; values?: AuthFormValues } | { state: "success" } | null> {
  const values = {
    first_name: String(formData.get("first_name") ?? "").trim(),
    last_name: String(formData.get("last_name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
  }
  const pending = await getPendingAuth()
  if (!pending) {
    return { state: "error", error: "Your sign-in expired. Please sign in again.", values }
  }
  const authorization = `Bearer ${pending.token}`
  try {
    await sdk.store.customer.create(
      { email: pending.email, ...values, phone: values.phone || undefined },
      {},
      { authorization }
    )
    const { token } = await sdk.client.fetch<{ token: string }>("/auth/token/refresh", {
      method: "POST",
      headers: { authorization },
    })
    await setAuthToken(token)
  } catch (error) {
    return { state: "error", error: friendlyAuthError(error), values }
  }
  await removePendingAuth()
  await removePendingCustomer()
  revalidateTag(await getCacheTag("customers"))
  try {
    await transferCart()
  } catch {
    // The cart stays as it is; the customer is signed in.
  }
  return { state: "success" }
}

// Confirms a customer's email using the token from the verification link.
//
// The confirm route doesn't require authentication, so this works even when the
// customer opens the link on a different device than the one they signed up on.
export async function confirmEmailVerification(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await sdk.auth.verification.confirm({ code: token })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// Password reset (TASKS P1-18), docs "Reset Customer Password in Storefront".
// The backend answers the same whether or not the email has an account, so
// the page never reveals which emails are registered; the email itself is sent
// by the backend's auth.password_reset subscriber.
export type PasswordFormState =
  | { state: "error"; error: string }
  | { state: "success" }
  | null

async function sendPasswordResetLink(
  email: string,
  captchaToken: string
): Promise<PasswordFormState> {
  try {
    await sdk.client.fetch("/auth/customer/emailpass/reset-password", {
      method: "POST",
      // Checked by the backend's CAPTCHA middleware (TASKS P1-21).
      // 201 Created with a plain-text body, as the JS SDK's resetPassword sends.
      headers: { "x-captcha-token": captchaToken, accept: "text/plain" },
      body: { identifier: email },
    })
    return { state: "success" }
  } catch {
    return {
      state: "error",
      error: "We couldn't send the link right now. Please try again.",
    }
  }
}

export async function requestPasswordReset(
  _currentState: unknown,
  formData: FormData
): Promise<PasswordFormState> {
  const email = String(formData.get("email") ?? "").trim()
  if (!email) {
    return { state: "error", error: "Enter your email address." }
  }
  return sendPasswordResetLink(email, String(formData.get("captcha_token") ?? ""))
}

// Account → Profile: a signed-in customer changes their password through the
// same emailed link (Medusa has no store route that changes a password with
// the old one).
export async function requestOwnPasswordReset(): Promise<PasswordFormState> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { state: "error", error: "Sign in again, then try once more." }
  }
  try {
    // The signed-in route needs no CAPTCHA (backend
    // /store/customers/me/password-reset, same core workflow).
    await sdk.client.fetch("/store/customers/me/password-reset", { method: "POST", headers })
    return { state: "success" }
  } catch {
    return { state: "error", error: "We couldn't send the link right now. Please try again." }
  }
}

// The reset link's token goes in the Authorization header (since v2.6; the
// JS SDK's updateProvider does this). It works once and expires after 15
// minutes.
export async function resetPassword(
  _currentState: unknown,
  formData: FormData
): Promise<PasswordFormState> {
  const token = String(formData.get("token") ?? "")
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")
  const confirm = String(formData.get("confirm_password") ?? "")
  if (!token || !email) {
    return { state: "error", error: "This link is incomplete. Request a new one." }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      state: "error",
      error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }
  if (password !== confirm) {
    return { state: "error", error: "The two passwords don't match." }
  }
  try {
    await sdk.auth.updateProvider("customer", "emailpass", { email, password }, token)
    return { state: "success" }
  } catch {
    return {
      state: "error",
      error: "This link is invalid or has expired. Request a new one.",
    }
  }
}

// Change password while signed in (owner, 2026-10-06): the backend's
// POST /store/customers/me/password checks the current password first.
export async function changePassword(
  _currentState: unknown,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const current = String(formData.get("current_password") ?? "")
  const next = String(formData.get("new_password") ?? "")
  const confirm = String(formData.get("confirm_password") ?? "")
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (next !== confirm) {
    return { success: false, error: "The two new passwords don't match." }
  }
  if (next === current) {
    return { success: false, error: "Choose a password different from the current one." }
  }
  try {
    await sdk.client.fetch("/store/customers/me/password", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: { current_password: current, new_password: next },
    })
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export async function signout(countryCode: string) {
  await sdk.auth.logout()

  await removeAuthToken()

  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag)

  await removeCartId()

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)

  redirect(`/${countryCode}/account`)
}

export async function transferCart() {
  const cartId = await getCartId()

  if (!cartId) {
    return
  }

  const headers = await getAuthHeaders()

  await sdk.store.cart.transferCart(cartId, {}, headers)

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)
}

export const addCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> => {
  const isDefaultBilling = (currentState.isDefaultBilling as boolean) || false
  const isDefaultShipping = (currentState.isDefaultShipping as boolean) || false

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
    phone: formData.get("phone") as string,
    is_default_billing: isDefaultBilling,
    is_default_shipping: isDefaultShipping,
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .createAddress(address, {}, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const deleteCustomerAddress = async (
  addressId: string
): Promise<void> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.customer
    .deleteAddress(addressId, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> => {
  const addressId =
    (currentState.addressId as string) || (formData.get("addressId") as string)

  if (!addressId) {
    return { success: false, error: "Address ID is required" }
  }

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
  } as HttpTypes.StoreUpdateCustomerAddress

  const phone = formData.get("phone") as string

  if (phone) {
    address.phone = phone
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .updateAddress(addressId, address, {}, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}
