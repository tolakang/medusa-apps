import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto"
import type { Logger } from "@medusajs/framework/types"
import {
  callbackSignature,
  formatAmount,
  hmac,
  merchantAuth,
  readRsaPublicKey,
  RSA_KEY_UNREADABLE_MESSAGE,
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

  describe("a new form for the same session (updatePayment)", () => {
    const replies = (...bodies: object[]) => {
      for (const body of bodies) {
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body })
      }
    }

    it("closes the old transaction before signing a new one", async () => {
      replies({ status: { code: "6" } }, { status: { code: "00" } }, { status: { code: "6" } })
      const out = await service().updatePayment({
        amount: 10,
        currency_code: "usd",
        data: { tran_id: "old", session_id: "payses_1" },
      })
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        expect.stringContaining("/check-transaction-2"),
        expect.stringContaining("/close-transaction"),
        expect.stringContaining("/check-transaction-2"),
      ])
      expect(out.data?.tran_id).not.toEqual("old")
    })

    it("refuses when the old transaction is already paid", async () => {
      replies(approved(10))
      await expect(
        service().updatePayment({ amount: 10, currency_code: "usd", data: { tran_id: "old" } })
      ).rejects.toThrow("already paid")
    })
  })

  describe("refunds (Refund API)", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 })
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString()
    // Node refuses PKCS#1 v1.5 private decryption, so strip the padding by
    // hand: 0x00 0x02 <non-zero random> 0x00 <message>.
    const decrypt = (b64: string) => {
      const all = Buffer.from(b64, "base64")
      const out: Buffer[] = []
      for (let i = 0; i < all.length; i += 128) {
        const block = privateDecrypt(
          { key: privateKey, padding: constants.RSA_NO_PADDING },
          all.subarray(i, i + 128)
        )
        out.push(block.subarray(block.indexOf(0, 2) + 1))
      }
      return Buffer.concat(out).toString("utf8")
    }
    const withKey = () =>
      new PaywayProviderService({ logger }, { ...options, rsa_public_key: pem })

    it("encrypts the JSON in 117-byte chunks that ABA's key can read", () => {
      const payload = {
        mc_id: "ec000002",
        tran_id: "17630000000001234567",
        refund_amount: 12.5,
        // long enough to need two chunks
        note: "x".repeat(150),
      } as unknown as { mc_id: string; tran_id: string; refund_amount: number }
      const auth = merchantAuth(payload, pem)
      expect(Buffer.from(auth, "base64")).toHaveLength(256)
      expect(JSON.parse(decrypt(auth))).toEqual(payload)
    })

    it("reads the key however the env file holds it", () => {
      const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "")
      const pkcs1 = publicKey.export({ type: "pkcs1", format: "pem" }).toString()
      for (const text of [
        pem,
        body,
        `"${pem.trim()}"`,
        pem.trim().replace(/\n/g, "\\n"),
        pkcs1,
        pkcs1.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""),
      ]) {
        expect(readRsaPublicKey(text).asymmetricKeyDetails?.modulusLength).toEqual(1024)
      }
      // A multi-line paste cut to its first line (staging 2026-11-13).
      expect(() => readRsaPublicKey("-----BEGIN PUBLIC KEY-----")).toThrow(RSA_KEY_UNREADABLE_MESSAGE)
    })

    it("explains an unreadable key instead of failing with an unknown error", async () => {
      const broken = new PaywayProviderService({ logger }, { ...options, rsa_public_key: "-----BEGIN PUBLIC KEY-----" })
      await expect(
        broken.refundPayment({ amount: 1, data: { tran_id: "1", currency: "USD" } })
      ).rejects.toThrow("PAYWAY_RSA_PUBLIC_KEY can't be read")
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("refunds the amount through PayWay and records the total refunded", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          grand_total: 20,
          total_refunded: 7.5,
          currency: "USD",
          transaction_status: "REFUNDED",
          status: { code: "00", message: "Success!" },
        }),
      })
      const out = await withKey().refundPayment({
        amount: 7.5,
        data: { tran_id: "123", currency: "USD" },
      })
      expect(out.data).toMatchObject({ tran_id: "123", payway_total_refunded: 7.5 })
      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toContain("/online-transaction/refund")
      const body = JSON.parse(init.body)
      expect(body.merchant_id).toEqual("ec000002")
      expect(body.hash).toEqual(
        hmac(`${body.request_time}${body.merchant_id}${body.merchant_auth}`, API_KEY)
      )
      expect(JSON.parse(decrypt(body.merchant_auth))).toEqual({
        mc_id: "ec000002",
        tran_id: "123",
        refund_amount: 7.5,
      })
    })

    it("sends KHR refunds as whole riel", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: { code: "00" } }),
      })
      await withKey().refundPayment({ amount: 4100.4, data: { tran_id: "9", currency: "KHR" } })
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(JSON.parse(decrypt(body.merchant_auth)).refund_amount).toEqual(4100)
    })

    it("fails the refund when PayWay refuses it, so Medusa records nothing", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: { code: "PTL37", message: "Refund amount cannot exceed the original purchase amount." },
        }),
      })
      await expect(
        withKey().refundPayment({ amount: 99, data: { tran_id: "1", currency: "USD" } })
      ).rejects.toThrow("PTL37")
    })

    it("without ABA's key, points staff to the portal and calls nothing", async () => {
      await expect(service().refundPayment({ amount: 5, data: { tran_id: "1" } })).rejects.toThrow(
        "PayWay merchant portal"
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
