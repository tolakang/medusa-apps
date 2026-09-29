import {
  contactProblem,
  EMAIL_REQUIRED_MESSAGE,
  SHIPPING_PHONE_REQUIRED_MESSAGE,
} from "../phone-validation"

describe("contactProblem (required contact by delivery country)", () => {
  it("Cambodia: needs the delivery phone, email optional", () => {
    expect(contactProblem({ shipping_address: { country_code: "kh", phone: "012 345 678" } })).toBeNull()
    expect(contactProblem({ shipping_address: { country_code: "kh" } })).toEqual(
      SHIPPING_PHONE_REQUIRED_MESSAGE
    )
    expect(
      contactProblem({ email: "a@b.co", shipping_address: { country_code: "kh", phone: "" } })
    ).toEqual(SHIPPING_PHONE_REQUIRED_MESSAGE)
  })

  it("other countries: need the email, phone optional", () => {
    expect(contactProblem({ email: "a@b.co", shipping_address: { country_code: "dk" } })).toBeNull()
    expect(
      contactProblem({ shipping_address: { country_code: "dk", phone: "012 345 678" } })
    ).toEqual(EMAIL_REQUIRED_MESSAGE)
  })
})
