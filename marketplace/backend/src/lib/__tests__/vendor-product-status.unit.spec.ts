import {
  productApprovalRequired,
  VENDOR_PRODUCT_NEEDS_APPROVAL_MESSAGE,
  vendorProductStatus,
} from "../vendor-product-status"

// TASKS P6-04, F-075: a vendor's new product status.
describe("vendor product status", () => {
  it("needs approval unless MARKETPLACE_REQUIRE_PRODUCT_APPROVAL is false", () => {
    expect(productApprovalRequired({})).toBe(true)
    expect(productApprovalRequired({ MARKETPLACE_REQUIRE_PRODUCT_APPROVAL: "true" })).toBe(true)
    expect(productApprovalRequired({ MARKETPLACE_REQUIRE_PRODUCT_APPROVAL: "" })).toBe(true)
    expect(productApprovalRequired({ MARKETPLACE_REQUIRE_PRODUCT_APPROVAL: " FALSE " })).toBe(false)
    expect(productApprovalRequired({ MARKETPLACE_REQUIRE_PRODUCT_APPROVAL: "false" })).toBe(false)
  })

  it("defaults to draft", () => {
    expect(vendorProductStatus(undefined, true)).toBe("draft")
    expect(vendorProductStatus(null, false)).toBe("draft")
  })

  it("keeps draft and proposed", () => {
    expect(vendorProductStatus("draft", true)).toBe("draft")
    expect(vendorProductStatus("proposed", true)).toBe("proposed")
  })

  it("publishes only without approval", () => {
    expect(vendorProductStatus("published", false)).toBe("published")
    expect(() => vendorProductStatus("published", true)).toThrow(
      VENDOR_PRODUCT_NEEDS_APPROVAL_MESSAGE
    )
  })

  it("refuses rejected and unknown statuses", () => {
    expect(() => vendorProductStatus("rejected", false)).toThrow(/one of/)
    expect(() => vendorProductStatus("live", false)).toThrow(/one of/)
  })
})
