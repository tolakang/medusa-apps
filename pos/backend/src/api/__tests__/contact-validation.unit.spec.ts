import { isValidPhone } from "../../lib/phone"
import { phoneProblem, validatePhoneFields } from "../contact-validation"

describe("isValidPhone", () => {
  it.each(["012 345 678", "+855 12 345 678", "(023) 999-888", "0969999999", "", null, undefined])(
    "accepts %p",
    (value) => expect(isValidPhone(value)).toBe(true)
  )

  it.each(["44x,fnsdk.jrnk.", "012 abc 678", "1234567", "+1234567890123456", "12+345678", 12345678])(
    "refuses %p",
    (value) => expect(isValidPhone(value)).toBe(false)
  )
})

describe("phoneProblem", () => {
  it("names the bad field", () => {
    expect(phoneProblem({ shipping_address: { phone: "44x,fnsdk" } })).toMatch(
      /^Shipping address phone: /
    )
    expect(phoneProblem({ billing_address: { phone: "abc" } })).toMatch(/^Billing address phone: /)
    expect(phoneProblem({ phone: "abc" })).toMatch(/^Phone: /)
  })

  it("passes bodies without phones or with valid ones", () => {
    expect(phoneProblem(undefined)).toBeNull()
    expect(phoneProblem({ email: "a@b.c" } as never)).toBeNull()
    expect(phoneProblem({ shipping_address: { phone: "012 345 678" }, billing_address: null })).toBeNull()
  })
})

describe("validatePhoneFields", () => {
  it("passes an invalid_data error to next", () => {
    const next = jest.fn()
    validatePhoneFields({ body: { phone: "abc" } } as never, {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ type: "invalid_data" })
  })

  it("calls next with nothing when valid", () => {
    const next = jest.fn()
    validatePhoneFields({ body: { phone: "012 345 678" } } as never, {} as never, next)
    expect(next).toHaveBeenCalledWith()
  })
})
