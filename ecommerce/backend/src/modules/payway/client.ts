import { createHmac, randomInt, timingSafeEqual } from "node:crypto"

// ABA PayWay eCommerce Checkout (TASKS D1, P1-03). Everything below follows
// PayWay's Developer Suite (developer.payway.com.kh, read 2026-10-01):
// - Purchase: POST {base}/api/payment-gateway/v1/payments/purchase
//   (multipart/form-data), hash = base64(HMAC-SHA512(concatenated values in
//   the documented order, API key)); required req_time, merchant_id, tran_id,
//   amount, hash. The response is PayWay's checkout page, so the customer's
//   browser posts this form.
// - Check transaction: POST {base}/api/payment-gateway/v1/payments/check-transaction-2
//   (JSON), hash over req_time + merchant_id + tran_id; payment_status_code
//   0 APPROVED/PRE-AUTH, 2 PENDING, 3 DECLINED, 4 REFUNDED, 7 CANCELLED.
// - Callback (return_url): JSON POST; header X-PayWay-HMAC-SHA512 =
//   base64(HMAC-SHA512(values sorted by key, arrays JSON-encoded, key)).
// - Base URLs: sandbox https://checkout-sandbox.payway.com.kh/, production
//   https://checkout.payway.com.kh/. Calls only work from whitelisted
//   domains/IPs ("6: wrong domain").

export const PAYWAY_SANDBOX_URL = "https://checkout-sandbox.payway.com.kh"
export const PURCHASE_PATH = "/api/payment-gateway/v1/payments/purchase"
export const CHECK_TRANSACTION_PATH = "/api/payment-gateway/v1/payments/check-transaction-2"
export const CALLBACK_SIGNATURE_HEADER = "x-payway-hmac-sha512"

// Purchase fields in the order PayWay concatenates them for the hash.
export const PURCHASE_HASH_ORDER = [
  "req_time",
  "merchant_id",
  "tran_id",
  "amount",
  "items",
  "shipping",
  "firstname",
  "lastname",
  "email",
  "phone",
  "type",
  "payment_option",
  "return_url",
  "cancel_url",
  "continue_success_url",
  "return_deeplink",
  "currency",
  "custom_fields",
  "return_params",
  "payout",
  "lifetime",
  "additional_params",
  "google_pay_token",
  "skip_success_page",
] as const

export type PurchaseField = (typeof PURCHASE_HASH_ORDER)[number]

export function hmac(text: string, apiKey: string): string {
  return createHmac("sha512", apiKey).update(text).digest("base64")
}

// UTC "YYYYMMDDHHmmss".
export function reqTime(now: Date = new Date()): string {
  return now.toISOString().replace(/[-:T]/g, "").slice(0, 14)
}

// Digits only, max 20 characters (PayWay tran_id), unique per attempt.
export function newTranId(now: number = Date.now()): string {
  return `${now}${randomInt(1000, 10000)}`
}

// USD with cents; KHR has no minor unit.
export function formatAmount(amount: number, currency: string): string {
  return currency.toUpperCase() === "KHR" ? String(Math.round(amount)) : amount.toFixed(2)
}

// Every posted field in PURCHASE_HASH_ORDER goes into the hash; fields not sent
// count as "". `unsigned` fields are posted but not hashed: PayWay's hash list
// leaves out e.g. `payment_gate` and `view_type`.
export function signPurchase(
  fields: Partial<Record<PurchaseField, string>>,
  apiKey: string,
  unsigned: Record<string, string> = {}
): Record<string, string> {
  const posted = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== "")
  ) as Record<string, string>
  const b4hash = PURCHASE_HASH_ORDER.map((key) => posted[key] ?? "").join("")
  return { ...posted, ...unsigned, hash: hmac(b4hash, apiKey) }
}

// Callback body values sorted by key and concatenated (PHP ksort + implode,
// arrays JSON-encoded), then HMAC-SHA512 with the API key.
export function callbackSignature(body: Record<string, unknown>, apiKey: string): string {
  const b4hash = Object.keys(body)
    .sort()
    .map((key) => {
      const value = body[key]
      if (value === null || value === undefined) return ""
      return typeof value === "object" ? JSON.stringify(value) : String(value)
    })
    .join("")
  return hmac(b4hash, apiKey)
}

export function sameSignature(given: unknown, expected: string): boolean {
  if (typeof given !== "string") return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type CheckTransactionResult = {
  code: string
  paymentStatusCode?: number
  paymentStatus?: string
  totalAmount?: number
  paymentAmount?: number
  paymentCurrency?: string
  apv?: string
}

export async function checkTransaction(
  opts: { baseUrl: string; merchantId: string; apiKey: string },
  tranId: string,
  fetchImpl: typeof fetch = fetch
): Promise<CheckTransactionResult> {
  const time = reqTime()
  const response = await fetchImpl(`${opts.baseUrl}${CHECK_TRANSACTION_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      req_time: time,
      merchant_id: opts.merchantId,
      tran_id: tranId,
      hash: hmac(`${time}${opts.merchantId}${tranId}`, opts.apiKey),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await response.json().catch(() => ({}))) as {
    data?: Record<string, unknown> & { status?: { code?: unknown } }
    status?: { code?: unknown }
  }
  const data = body.data ?? {}
  const code = String(body.status?.code ?? data.status?.code ?? response.status)
  return {
    code,
    paymentStatusCode:
      data.payment_status_code === undefined ? undefined : Number(data.payment_status_code),
    paymentStatus: typeof data.payment_status === "string" ? data.payment_status : undefined,
    totalAmount: data.total_amount === undefined ? undefined : Number(data.total_amount),
    paymentAmount: data.payment_amount === undefined ? undefined : Number(data.payment_amount),
    paymentCurrency: typeof data.payment_currency === "string" ? data.payment_currency : undefined,
    apv: typeof data.apv === "string" ? data.apv : undefined,
  }
}
