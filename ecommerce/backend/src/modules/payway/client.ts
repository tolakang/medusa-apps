import { constants, createHmac, createPublicKey, type KeyObject, publicEncrypt, randomInt } from "node:crypto"

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
// - Close transaction: POST {base}/api/payment-gateway/v1/payments/close-transaction
//   (JSON), hash over req_time + merchant_id + tran_id; status.code 00 success,
//   5 not found. A closed transaction no longer accepts payment and sends no
//   callback (developer.payway.com.kh, read 2026-10-05).
// - Refund: POST {base}/api/merchant-portal/merchant-access/online-transaction/refund
//   (JSON: request_time, merchant_id, merchant_auth, hash). merchant_auth =
//   base64 of the JSON {mc_id, tran_id, refund_amount} encrypted with ABA's
//   RSA public key in 117-byte chunks (PHP openssl_public_encrypt, PKCS#1
//   v1.5); hash = base64(HMAC-SHA512(request_time + merchant_id +
//   merchant_auth, API key)). Full or partial, within 30 days, completed
//   transactions only; status.code 00 success, PTL37 more than paid, PTL168
//   concurrent request (developer.payway.com.kh, read 2026-11-12).
// - Callback (return_url): JSON POST; header X-PayWay-HMAC-SHA512 =
//   base64(HMAC-SHA512(values sorted by key, arrays JSON-encoded, key)).
// - Base URLs: sandbox https://checkout-sandbox.payway.com.kh/, production
//   https://checkout.payway.com.kh/. Calls only work from whitelisted
//   domains/IPs ("6: wrong domain").

export const PAYWAY_SANDBOX_URL = "https://checkout-sandbox.payway.com.kh"
export const PURCHASE_PATH = "/api/payment-gateway/v1/payments/purchase"
export const CHECK_TRANSACTION_PATH = "/api/payment-gateway/v1/payments/check-transaction-2"
export const CLOSE_TRANSACTION_PATH = "/api/payment-gateway/v1/payments/close-transaction"
export const REFUND_PATH = "/api/merchant-portal/merchant-access/online-transaction/refund"
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

// Returns PayWay's status.code ("00" closed, "5" not found, …).
export async function closeTransaction(
  opts: { baseUrl: string; merchantId: string; apiKey: string },
  tranId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const time = reqTime()
  const response = await fetchImpl(`${opts.baseUrl}${CLOSE_TRANSACTION_PATH}`, {
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
  const body = (await response.json().catch(() => ({}))) as { status?: { code?: unknown } }
  return String(body.status?.code ?? response.status)
}

export const RSA_KEY_UNREADABLE_MESSAGE =
  "PAYWAY_RSA_PUBLIC_KEY can't be read. Put ABA's RSA public key on one line: either only the key text (without the BEGIN/END lines), or the whole key with \\n where the line breaks were. No quotes."

// ABA sends the RSA public key as text, and env files mangle it: quotes
// around it, "\n" escapes, a multi-line paste cut to its first line. Only
// the base64 body matters, read as SPKI ("BEGIN PUBLIC KEY") or PKCS#1
// ("BEGIN RSA PUBLIC KEY"). Throws RSA_KEY_UNREADABLE_MESSAGE otherwise
// (staging 2026-11-13: "DECODER routines::unsupported").
export function readRsaPublicKey(key: string): KeyObject {
  const body = key
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END)[^-]*-----/g, "")
    .replace(/\s+/g, "")
  if (body && /^[A-Za-z0-9+/]+=*$/.test(body)) {
    const der = Buffer.from(body, "base64")
    for (const type of ["spki", "pkcs1"] as const) {
      try {
        const parsed = createPublicKey({ key: der, format: "der", type })
        if (parsed.asymmetricKeyType === "rsa") {
          return parsed
        }
      } catch {
        // try the other format
      }
    }
  }
  throw new Error(RSA_KEY_UNREADABLE_MESSAGE)
}

// The JSON encrypted in chunks of (key bytes - 11): 117 for ABA's 1024-bit
// key, as PayWay's PHP sample. Concatenated, then base64.
export function merchantAuth(
  payload: { mc_id: string; tran_id: string; refund_amount: number },
  rsaPublicKey: string
): string {
  const key = readRsaPublicKey(rsaPublicKey)
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 1024
  const chunkSize = bits / 8 - 11
  const data = Buffer.from(JSON.stringify(payload), "utf8")
  const parts: Buffer[] = []
  for (let i = 0; i < data.length; i += chunkSize) {
    parts.push(
      publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, data.subarray(i, i + chunkSize))
    )
  }
  return Buffer.concat(parts).toString("base64")
}

export type RefundResult = {
  code: string
  message?: string
  totalRefunded?: number
  grandTotal?: number
  currency?: string
}

export async function refundTransaction(
  opts: { baseUrl: string; merchantId: string; apiKey: string; rsaPublicKey: string },
  tranId: string,
  amount: number,
  fetchImpl: typeof fetch = fetch
): Promise<RefundResult> {
  const time = reqTime()
  const auth = merchantAuth(
    { mc_id: opts.merchantId, tran_id: tranId, refund_amount: amount },
    opts.rsaPublicKey
  )
  const response = await fetchImpl(`${opts.baseUrl}${REFUND_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_time: time,
      merchant_id: opts.merchantId,
      merchant_auth: auth,
      hash: hmac(`${time}${opts.merchantId}${auth}`, opts.apiKey),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json().catch(() => ({}))) as {
    grand_total?: unknown
    total_refunded?: unknown
    currency?: unknown
    status?: { code?: unknown; message?: unknown }
  }
  return {
    code: String(body.status?.code ?? response.status),
    message: typeof body.status?.message === "string" ? body.status.message : undefined,
    totalRefunded: body.total_refunded === undefined ? undefined : Number(body.total_refunded),
    grandTotal: body.grand_total === undefined ? undefined : Number(body.grand_total),
    currency: typeof body.currency === "string" ? body.currency : undefined,
  }
}
