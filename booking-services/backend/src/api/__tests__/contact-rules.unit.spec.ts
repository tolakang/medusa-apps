import {
  contactProblem,
  EMAIL_REQUIRED_MESSAGE,
  SERVICE_CONTACT_MESSAGE,
  SHIPPING_PHONE_REQUIRED_MESSAGE,
} from "../contact-validation"

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

  it("booked services only (no item needs shipping): an email or a phone, no courier phone (P3-12)", () => {
    const services = [{ requires_shipping: false }, { requires_shipping: false }]
    expect(contactProblem({ email: "a@b.co", shipping_address: { country_code: "kh" }, items: services })).toBeNull()
    expect(
      contactProblem({ shipping_address: { country_code: "kh", phone: "012 345 678" }, items: services })
    ).toBeNull()
    expect(contactProblem({ shipping_address: { country_code: "kh" }, items: services })).toEqual(SERVICE_CONTACT_MESSAGE)
    expect(contactProblem({ items: services })).toEqual(SERVICE_CONTACT_MESSAGE)
  })

  it("a cart with anything shipped keeps the delivery rules", () => {
    const mixed = [{ requires_shipping: false }, { requires_shipping: true }]
    expect(contactProblem({ email: "a@b.co", shipping_address: { country_code: "kh" }, items: mixed })).toEqual(
      SHIPPING_PHONE_REQUIRED_MESSAGE
    )
    expect(contactProblem({ shipping_address: { country_code: "kh" }, items: [] })).toEqual(
      SHIPPING_PHONE_REQUIRED_MESSAGE
    )
  })
})
