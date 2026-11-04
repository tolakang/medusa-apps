import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  CALLBACK_SIGNATURE_HEADER,
  callbackSignature,
  checkTransaction,
  closeTransaction,
  formatAmount,
  newTranId,
  PAYWAY_SANDBOX_URL,
  PURCHASE_PATH,
  reqTime,
  signPurchase,
  type CheckTransactionResult,
} from "./client"
import { safeEqual } from "../../lib/safe-equal"

// ABA PayWay payment provider (TASKS D1, P1-03; Medusa docs "Create a Payment
// Module Provider", @medusajs/utils 2.21.1 AbstractPaymentProvider).
// Flow: initiatePayment signs a PayWay Purchase form (stored in the payment
// session's data) → the storefront posts it from the customer's browser →
// the customer pays on PayWay's page → PayWay calls
// /hooks/payment/payway_payway (getWebhookActionAndData; Medusa then
// completes the cart) and sends the customer back to the storefront, which
// completes the cart too (authorizePayment). Either way the payment status is
// confirmed with PayWay's Check Transaction API, never taken from the browser.
// PayWay takes the money at payment, so an approved payment is "captured".

export type PaywayOptions = {
  merchant_id: string
  api_key: string
  // https://checkout-sandbox.payway.com.kh (default) or https://checkout.payway.com.kh
  api_url?: string
  // Public URL of /hooks/payment/payway_payway, e.g. https://api.example.com/hooks/payment/payway_payway
  return_url: string
  // Public storefront URL, e.g. https://shop.example.com
  storefront_url: string
  // Minutes the customer has to pay (PayWay min 3; default 30).
  lifetime_minutes?: number
}

type InjectedDependencies = { logger: Logger }

export const PAYWAY_ALREADY_PAID_MESSAGE =
  "This cart is already paid with ABA PayWay. Place the order instead of paying again."

// What the storefront may send when it starts the session (display only).
type CustomerData = {
  country_code?: unknown
  firstname?: unknown
  lastname?: unknown
  email?: unknown
  phone?: unknown
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : ""

class PaywayProviderService extends AbstractPaymentProvider<PaywayOptions> {
  static identifier = "payway"
  protected options_: PaywayOptions
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: PaywayOptions) {
    super({ logger }, options)
    this.options_ = options
    this.logger_ = logger
  }

  static validateOptions(options: Record<string, unknown>) {
    for (const key of ["merchant_id", "api_key", "return_url", "storefront_url"]) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Option \`${key}\` is required in the PayWay provider's options.`
        )
      }
    }
  }

  private get baseUrl() {
    return (this.options_.api_url || PAYWAY_SANDBOX_URL).replace(/\/+$/, "")
  }

  private get credentials() {
    return {
      baseUrl: this.baseUrl,
      merchantId: this.options_.merchant_id,
      apiKey: this.options_.api_key,
    }
  }

  // A fresh signed Purchase form: new tran_id and req_time every time.
  private purchase(
    sessionId: string,
    amount: number,
    currencyCode: string,
    customer: CustomerData
  ) {
    const storefront = this.options_.storefront_url.replace(/\/+$/, "")
    const country = /^[a-z]{2}$/.test(String(customer.country_code ?? ""))
      ? String(customer.country_code)
      : "kh"
    const currency = currencyCode.toUpperCase()
    const tranId = newTranId()
    const amountText = formatAmount(amount, currency)
    const form = signPurchase(
      {
        req_time: reqTime(),
        merchant_id: this.options_.merchant_id,
        tran_id: tranId,
        amount: amountText,
        firstname: text(customer.firstname, 100),
        lastname: text(customer.lastname, 100),
        email: text(customer.email, 50),
        phone: text(customer.phone, 20).replace(/[^\d+]/g, ""),
        return_url: Buffer.from(this.options_.return_url).toString("base64"),
        cancel_url: `${storefront}/${country}/checkout?step=review`,
        continue_success_url: `${storefront}/${country}/checkout/payway-return`,
        currency,
        return_params: JSON.stringify({ session_id: sessionId }),
        lifetime: String(this.options_.lifetime_minutes ?? 30),
        skip_success_page: "1",
      },
      this.options_.api_key,
      // "If your merchant profile also supports the QR Payment API service,
      // please set this parameter to 0 to use the Checkout service" (PayWay
      // Purchase API). Without it PayWay answered with raw KHQR JSON instead
      // of its checkout page on the staging sandbox profile (2026-10-03).
      { payment_gate: "0" }
    )
    return {
      tran_id: tranId,
      session_id: sessionId,
      amount: amountText,
      currency,
      checkout_url: `${this.baseUrl}${PURCHASE_PATH}`,
      form,
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const data = (input.data ?? {}) as CustomerData & { session_id?: string }
    const sessionId = String(data.session_id ?? input.context?.idempotency_key ?? "")
    const payway = this.purchase(
      sessionId,
      Number(input.amount),
      input.currency_code,
      data
    )
    return { id: payway.tran_id, data: { ...data, ...payway }, status: PaymentSessionStatus.PENDING }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const data = (input.data ?? {}) as CustomerData & { session_id?: string }
    const payway = this.purchase(
      String(data.session_id ?? ""),
      Number(input.amount),
      input.currency_code,
      data
    )
    return { data: { ...data, ...payway }, status: PaymentSessionStatus.PENDING }
  }

  // PayWay status → Medusa session status. Only an approved payment for at
  // least the session's amount counts as paid.
  private toStatus(result: CheckTransactionResult, expectedAmount: number): PaymentSessionStatus {
    if (result.code !== "00") {
      // 6 = transaction not found: the customer has not paid (yet).
      return PaymentSessionStatus.PENDING
    }
    switch (result.paymentStatusCode) {
      case 0: {
        const paid = result.totalAmount ?? result.paymentAmount ?? 0
        if (!(paid + 1e-9 >= expectedAmount)) {
          this.logger_.warn(`PayWay paid ${paid} is less than the order amount ${expectedAmount}.`)
          return PaymentSessionStatus.ERROR
        }
        return PaymentSessionStatus.CAPTURED
      }
      case 2:
        return PaymentSessionStatus.PENDING
      case 7:
        return PaymentSessionStatus.CANCELED
      default:
        return PaymentSessionStatus.ERROR
    }
  }

  private async check(data: Record<string, unknown> | undefined) {
    const tranId = String(data?.tran_id ?? "")
    if (!tranId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "PayWay payment has no transaction ID.")
    }
    const result = await checkTransaction(this.credentials, tranId)
    const status = this.toStatus(result, Number(data?.amount ?? 0))
    return {
      status,
      data: {
        ...data,
        payway_status: result.paymentStatus ?? result.code,
        payway_apv: result.apv,
        payway_paid_amount: result.paymentAmount,
        payway_paid_currency: result.paymentCurrency,
      },
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return this.check(input.data)
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return this.check(input.data)
  }

  // PayWay takes the money at payment time: nothing left to capture.
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data }
  }

  // No call to PayWay: closing a transaction could reject a payment the
  // customer is making right now. Unpaid transactions expire after `lifetime`.
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  // Medusa deletes the cart's session before it creates a new one (the
  // customer pressed Pay again, changed the cart or chose another provider;
  // core-flows createPaymentSessionsWorkflow, refreshPaymentCollectionForCart).
  // The old PayWay page may still be open, so: a paid transaction stops the
  // delete (the order must be placed from it; deleting it would leave paid
  // money without an order), and an unpaid one is closed so it can no longer
  // be paid. Checked again after closing in case the payment landed meanwhile.
  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    const tranId = String(input.data?.tran_id ?? "")
    if (!tranId) {
      return { data: input.data }
    }
    const isPaid = async () => {
      const result = await checkTransaction(this.credentials, tranId)
      return result.code === "00" && result.paymentStatusCode === 0
    }
    if (await isPaid()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PAYWAY_ALREADY_PAID_MESSAGE)
    }
    const closed = await closeTransaction(this.credentials, tranId)
    if (closed !== "00" && closed !== "5") {
      this.logger_.warn(`PayWay close-transaction ${tranId} answered ${closed}.`)
    }
    if (await isPaid()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PAYWAY_ALREADY_PAID_MESSAGE)
    }
    return { data: input.data }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  // PayWay's Refund API needs an RSA public key from ABA (not part of the
  // sandbox credentials). Until then refunds are made in the PayWay portal.
  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "PayWay refunds are not automatic yet: refund this payment in the PayWay merchant portal."
    )
  }

  // PayWay's callback. The signature is checked, then the payment is
  // confirmed with Check Transaction; the body's own status is not trusted.
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const ignore: WebhookActionResult = { action: PaymentActions.NOT_SUPPORTED }
    const body = (payload.data ?? {}) as Record<string, unknown>
    const signature = payload.headers?.[CALLBACK_SIGNATURE_HEADER]
    if (!safeEqual(signature, callbackSignature(body, this.options_.api_key))) {
      this.logger_.warn("PayWay callback ignored: signature does not match.")
      return ignore
    }

    let sessionId = ""
    try {
      sessionId = String(JSON.parse(String(body.return_params ?? "{}")).session_id ?? "")
    } catch {
      sessionId = ""
    }
    const tranId = String(body.tran_id ?? "")
    if (!sessionId || !tranId) {
      return ignore
    }

    const result = await checkTransaction(this.credentials, tranId)
    const amount = new BigNumber(result.totalAmount ?? result.paymentAmount ?? 0)
    if (result.code === "00" && result.paymentStatusCode === 0) {
      return { action: PaymentActions.SUCCESSFUL, data: { session_id: sessionId, amount } }
    }
    if (result.code === "00" && result.paymentStatusCode === 3) {
      return { action: PaymentActions.FAILED, data: { session_id: sessionId, amount } }
    }
    return ignore
  }
}

export default PaywayProviderService
