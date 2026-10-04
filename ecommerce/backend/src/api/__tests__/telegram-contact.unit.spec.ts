import { isValidTelegramContact, telegramContactLabel } from "../../lib/telegram-contact"
import { phoneProblem } from "../phone-validation"
import { renderMessage } from "../../modules/telegram/templates"
import { ORDER_PLACED_STAFF_TEMPLATE } from "../../lib/order-notification"

describe("isValidTelegramContact", () => {
  it.each(["@example_shop", "example_shop", "Test_Customer", "012 345 678", "+855 12 345 678", "", null, undefined])(
    "accepts %p",
    (value) => expect(isValidTelegramContact(value)).toBe(true)
  )

  it.each(["@abc", "1abcdef", "test customer", "@test-customer", "https://t.me/example_shop", "12345", 42])(
    "refuses %p",
    (value) => expect(isValidTelegramContact(value)).toBe(false)
  )
})

describe("telegramContactLabel", () => {
  it("links usernames and adds the @", () => {
    expect(telegramContactLabel("example_shop")).toEqual({
      text: "@example_shop",
      url: "https://t.me/example_shop",
    })
  })

  it("keeps phone numbers as typed, without a link", () => {
    expect(telegramContactLabel("012 345 678")).toEqual({ text: "012 345 678" })
  })

  it("returns null for empty or invalid values", () => {
    expect(telegramContactLabel("")).toBeNull()
    expect(telegramContactLabel("@abc")).toBeNull()
  })
})

describe("phoneProblem with the Telegram contact", () => {
  it("refuses an invalid Telegram contact in the cart metadata", () => {
    expect(phoneProblem({ metadata: { telegram_contact: "test customer" } })).toMatch(/^Telegram: /)
  })

  it("passes a valid or empty one", () => {
    expect(phoneProblem({ metadata: { telegram_contact: "@example_shop" } })).toBeNull()
    expect(phoneProblem({ metadata: { telegram_contact: "" } })).toBeNull()
    expect(phoneProblem({ metadata: { other: "x" } })).toBeNull()
  })
})

describe("staff alert", () => {
  it("shows the customer's Telegram link when given", () => {
    const text = renderMessage(ORDER_PLACED_STAFF_TEMPLATE, {
      order: { display_id: 7, total: 15, metadata: { telegram_contact: "example_shop" } },
    })
    expect(text).toContain("Telegram: https://t.me/example_shop")
  })

  it("leaves the line out when there is none", () => {
    const text = renderMessage(ORDER_PLACED_STAFF_TEMPLATE, { order: { display_id: 7, total: 15 } })
    expect(text).not.toContain("Telegram:")
  })
})
