import type { Logger } from "@medusajs/framework/types"
import {
  callbackSignature,
  formatAmount,
  newTranId,
  reqTime,
  signPurchase,
} from "../client"
import PaywayProviderService from "../service"

// ABA PayWay provider (TASKS P1-03). Fake keys only: fetch is mocked, nothing
// reaches PayWay. The expected hashes were computed separately with Python's
// hmac/hashlib following PayWay's PHP samples (concatenation order for
// Purchase; ksort + concatenation for the callback).
const API_KEY = "test-api-key"
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger
const options = {
  merchant_id: "ec000002",
  api_key: API_KEY,
  return_url: "https://api.example.com/hooks/payment/payway_payway",
  storefront_url: "https://shop.example.com",
}

describe("PayWay signing", () => {
  it("signs a Purchase form like PayWay's PHP sample", () => {
    const form = signPurchase(
      {
        req_time: "20261001120000",
        merchant_id: "ec000002",
        tran_id: "17593200000001234",
        amount: "63.00",
        firstname: "Test",
        lastname: "Customer",
        phone: "012345678",
        return_url: Buffer.from(options.return_url).toString("base64"),
        cancel_url: "https://shop.example.com/kh/checkout?step=review",
        continue_success_url: "https://shop.example.com/kh/checkout/payway-return",
        currency: "USD",
        return_params: '{"session_id":"payses_123"}',
        lifetime: "30",
        skip_success_page: "1",
        email: "",
      },
      API_KEY
    )
    expect(form.hash).toEqual(
      "NvI1j5w+VuaKX6gLtRoCwVm6SeQQQKp6svoYhTGre8eVjMlh5rRoufRppJXXdSNpk7aAINAbfe2vwbjAtXuHhA=="
    )
    // Empty fields are not posted.
    expect(form).not.toHaveProperty("email")
  })

  it("checks a callback signature like PayWay's PHP sample", () => {
    const body = {
      tran_id: "17593200000001234",
      apv: "544415",
      status: "0",
      return_params: '{"session_id":"payses_123"}',
      original_amount: 63,
      payment_amount: 63,
      total_amount: 63,
      discount_amount: 0,
      payment_currency: "USD",
      original_currency: "USD",
      transaction_date: "2026-10-01 19:00:00",
      payment_type: "ABA Pay",
    }
    expect(callbackSignature(body, API_KEY)).toEqual(
      "xkOOQwW4/oIBXWkLKpx5LGJ7AA4rnlwIoxPOuTSbp39zo+qfPkN8mZb3l6ib1JgcCH+iTun0HZ+avzLjq6H2dw=="
    )
  })

  it("formats request time, transaction IDs and amounts", () => {
    expect(reqTime(new Date("2026-10-01T12:34:56.789Z"))).toEqual("20261001123456")
    expect(newTranId(1759320000000)).toMatch(/^\d{17}$/)
    expect(formatAmount(63, "usd")).toEqual("63.00")
    expect(formatAmount(16.5, "USD")).toEqual("16.50")
    expect(formatAmount(12000.4, "KHR")).toEqual("12000")
  })
})

describe("PayWay provider", () => {
  const fetchMock = jest.fn()
  const replyWith = (body: object) =>
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body })
  const approved = (total: number, code = 0) => ({
    data: {
      payment_status_code: code,
      payment_status: code === 0 ? "APPROVED" : code === 2 ? "PENDING" : "DECLINED",
      total_amount: total,
      payment_amount: total,
      payment_currency: "USD",
      apv: "544415",
    },
    status: { code: "00", message: "Success!", tran_id: "x" },
  })

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  const service = () => new PaywayProviderService({ logger }, options)

  it("requires its options", () => {
    expect(() => PaywayProviderService.validateOptions({ ...options, api_key: "" })).toThrow(
      "api_key"
    )
    expect(() => PaywayProviderService.validateOptions(options)).not.toThrow()
  })

  it("initiates a session with a signed form for the customer's browser", async () => {
    const result = await service().initiatePayment({
      amount: 63,
      currency_code: "usd",
      data: {
        session_id: "payses_123",
        country_code: "kh",
        firstname: "Test",
        lastname: "Customer",
        phone: "012 345 678",
      },
    })
    const data = result.data as Record<string, any>
    expect(result.status).toEqual("pending")
    expect(result.id).toEqual(data.tran_id)
    expect(data.checkout_url).toEqual(
      "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase"
    )
    expect(data.form).toMatchObject({
      merchant_id: "ec000002",
      tran_id: data.tran_id,
      amount: "63.00",
      currency: "USD",
      phone: "012345678",
      return_params: '{"session_id":"payses_123"}',
      continue_success_url: "https://shop.example.com/kh/checkout/payway-return",
      cancel_url: "https://shop.example.com/kh/checkout?step=review",
    })
    expect(Buffer.from(data.form.return_url, "base64").toString()).toEqual(options.return_url)
    const { hash, ...fields } = data.form
    expect(signPurchase(fields, API_KEY).hash).toEqual(hash)
    // Checkout page, not the QR Payment API; payment_gate is not in PayWay's hash list.
    expect(data.form.payment_gate).toEqual("0")
    const { payment_gate: _gate, ...signedOnly } = fields
    expect(signPurchase(signedOnly, API_KEY).hash).toEqual(hash)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("marks an approved payment for the full amount as captured", async () => {
    replyWith(approved(63))
    const result = await service().authorizePayment({ data: { tran_id: "1", amount: "63.00" } })
    expect(result.status).toEqual("captured")
    expect(result.data).toMatchObject({ payway_status: "APPROVED", payway_apv: "544415" })
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchMock.mock.calls[0][0]).toContain("/payments/check-transaction-2")
    expect(request).toMatchObject({ merchant_id: "ec000002", tran_id: "1" })
  })

  it("refuses less than the order amount, and waits while unpaid", async () => {
    replyWith(approved(10))
    expect((await service().authorizePayment({ data: { tran_id: "1", amount: "63.00" } })).status).toEqual("error")
    replyWith(approved(63, 2))
    expect((await service().authorizePayment({ data: { tran_id: "1", amount: "63.00" } })).status).toEqual("pending")
    replyWith({ status: { code: "6", message: "Transaction not found" } })
    expect((await service().authorizePayment({ data: { tran_id: "1", amount: "63.00" } })).status).toEqual("pending")
  })

  it("handles PayWay's callback only when the signature matches", async () => {
    const body = {
      tran_id: "17593200000001234",
      status: "0",
      return_params: '{"session_id":"payses_123"}',
      total_amount: 63,
    }
    const forged = await service().getWebhookActionAndData({
      data: body,
      rawData: JSON.stringify(body),
      headers: { "x-payway-hmac-sha512": "forged" },
    })
    expect(forged.action).toEqual("not_supported")
    expect(fetchMock).not.toHaveBeenCalled()

    replyWith(approved(63))
    const ok = await service().getWebhookActionAndData({
      data: body,
      rawData: JSON.stringify(body),
      headers: { "x-payway-hmac-sha512": callbackSignature(body, API_KEY) },
    })
    expect(ok.action).toEqual("captured")
    expect(ok.data?.session_id).toEqual("payses_123")
    expect(Number(ok.data?.amount)).toEqual(63)

    replyWith(approved(63, 3))
    const declined = await service().getWebhookActionAndData({
      data: body,
      rawData: JSON.stringify(body),
      headers: { "x-payway-hmac-sha512": callbackSignature(body, API_KEY) },
    })
    expect(declined.action).toEqual("failed")
  })

  describe("replacing a session (deletePayment)", () => {
    const notFound = { status: { code: "6", message: "Transaction not found" } }
    const closed = { status: { code: "00", message: "Success!", tran_id: "1" } }
    const replies = (...bodies: object[]) => {
      for (const body of bodies) {
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body })
      }
    }
    const urls = () => fetchMock.mock.calls.map(([url]) => String(url))

    it("closes an unpaid transaction so the old PayWay page can't take money", async () => {
      replies(notFound, closed, notFound)
      await expect(service().deletePayment({ data: { tran_id: "1" } })).resolves.toEqual({
        data: { tran_id: "1" },
      })
      expect(urls()).toEqual([
        expect.stringContaining("/check-transaction-2"),
        expect.stringContaining("/close-transaction"),
        expect.stringContaining("/check-transaction-2"),
      ])
      const close = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(close).toMatchObject({ merchant_id: "ec000002", tran_id: "1" })
    })

    it("refuses to delete a paid transaction", async () => {
      replies(approved(63))
      await expect(service().deletePayment({ data: { tran_id: "1" } })).rejects.toThrow(
        "already paid"
      )
      expect(urls()).toHaveLength(1)
    })

    it("refuses when the payment lands while the transaction is being closed", async () => {
      replies(approved(63, 2), closed, approved(63))
      await expect(service().deletePayment({ data: { tran_id: "1" } })).rejects.toThrow(
        "already paid"
      )
    })

    it("does nothing for a session without a PayWay transaction", async () => {
      await service().deletePayment({ data: {} })
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  it("points refunds to the PayWay portal", async () => {
    await expect(service().refundPayment({ amount: 5, data: {} })).rejects.toThrow(
      "PayWay merchant portal"
    )
  })
})
