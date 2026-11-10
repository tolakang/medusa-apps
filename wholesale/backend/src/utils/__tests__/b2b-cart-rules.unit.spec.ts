import {
  assertApprovalsGranted,
  assertApprovedCompanyBuyer,
  assertCartItemsUnlocked,
  assertCreditLimit,
  assertMinOrderQuantities,
  B2bBuyer,
  B2bCompany,
  getMinOrderQuantity,
  getOutstandingCredit,
  requiredApprovalTypes,
  spendOrders,
} from "../b2b-cart-rules";

// P4-04 (plan §6.4): the B2B cart rules.

const company = (over: Partial<B2bCompany> = {}): B2bCompany => ({
  id: "comp_1",
  status: "approved",
  payment_terms: "net_30",
  credit_limit: 1000,
  ...over,
});

const buyer = (c: B2bCompany | null): B2bBuyer => ({
  customer_id: "cus_1",
  employee: { id: "emp_1", spending_limit: 0, company: c },
});

describe("assertApprovedCompanyBuyer", () => {
  it("returns the company of an approved company's employee", () => {
    expect(assertApprovedCompanyBuyer(buyer(company())).id).toEqual("comp_1");
  });

  it.each([
    [null, "Sign in with a company account"],
    [{ customer_id: "cus_1", employee: null }, "not part of a company"],
    [buyer(null), "not part of a company"],
    [buyer(company({ status: "pending" })), "waiting for approval"],
    [buyer(company({ status: "suspended" })), "suspended"],
  ])("refuses %#", (input, message) => {
    expect(() => assertApprovedCompanyBuyer(input as B2bBuyer | null)).toThrow(
      message
    );
  });
});

describe("getMinOrderQuantity", () => {
  it("reads the variant first, then the product", () => {
    expect(
      getMinOrderQuantity({
        metadata: { min_order_quantity: 12 },
        product: { metadata: { min_order_quantity: 6 } },
      })
    ).toEqual(12);
    expect(
      getMinOrderQuantity({
        metadata: {},
        product: { metadata: { min_order_quantity: "6" } },
      })
    ).toEqual(6);
  });

  it.each([undefined, null, 0, 1, -5, 2.5, "abc", "", true])(
    "treats %p as no minimum",
    (value) => {
      expect(
        getMinOrderQuantity({ metadata: { min_order_quantity: value } })
      ).toEqual(1);
    }
  );

  it("is 1 for a variant without metadata", () => {
    expect(getMinOrderQuantity(null)).toEqual(1);
    expect(getMinOrderQuantity({})).toEqual(1);
  });
});

describe("assertMinOrderQuantities", () => {
  it("passes at or above the minimum, and for a removed line", () => {
    expect(() =>
      assertMinOrderQuantities([
        { title: "Paper", quantity: 10, minimum: 10 },
        { title: "Pens", quantity: 0, minimum: 50 },
      ])
    ).not.toThrow();
  });

  it("refuses a line below the minimum, naming it", () => {
    expect(() =>
      assertMinOrderQuantities([{ title: "Paper", quantity: 9, minimum: 10 }])
    ).toThrow("Paper has a minimum order quantity of 10.");
  });
});

describe("getOutstandingCredit", () => {
  it("adds what each live order still owes", () => {
    expect(
      getOutstandingCredit([
        { status: "pending", total: 300, payment_collections: [] },
        {
          status: "completed",
          total: 200,
          payment_collections: [{ captured_amount: 200 }],
        },
        {
          status: "pending",
          total: 500,
          payment_collections: [{ captured_amount: 100 }, null],
        },
        { status: "canceled", total: 900, payment_collections: [] },
        { status: "draft", total: 900, payment_collections: [] },
        null,
      ])
    ).toEqual(300 + 0 + 400);
  });

  it("never counts an over-captured order as credit", () => {
    expect(
      getOutstandingCredit([
        { status: "pending", total: 100, payment_collections: [{ captured_amount: 150 }] },
        { status: "pending", total: 50 },
      ])
    ).toEqual(50);
  });
});

describe("assertCreditLimit", () => {
  it("allows up to the limit and refuses above it", () => {
    expect(() => assertCreditLimit(company(), 600, 400)).not.toThrow();
    expect(() => assertCreditLimit(company(), 600, 401)).toThrow(
      "over its credit limit"
    );
  });

  it("ignores prepaid companies and companies with no limit set", () => {
    expect(() =>
      assertCreditLimit(company({ payment_terms: "prepaid" }), 5000, 5000)
    ).not.toThrow();
    expect(() =>
      assertCreditLimit(company({ credit_limit: null }), 5000, 5000)
    ).not.toThrow();
  });

  it("a limit of 0 means no credit at all on net terms", () => {
    expect(() =>
      assertCreditLimit(company({ credit_limit: 0 }), 0, 1)
    ).toThrow("over its credit limit");
  });
});

describe("spendOrders", () => {
  it("drops canceled orders and drafts", () => {
    expect(
      spendOrders([
        { id: "a", status: "pending" },
        { id: "b", status: "canceled" },
        { id: "c", status: "draft" },
        { id: "d", status: "completed" },
        null,
      ]).map((order) => order!.id)
    ).toEqual(["a", "d"]);
  });
});

// P4-05: approvals above a limit.

describe("requiredApprovalTypes", () => {
  const both = {
    requires_admin_approval: true,
    requires_sales_manager_approval: true,
    approval_threshold: 1000,
  };

  it("needs nothing at or below the threshold", () => {
    expect(requiredApprovalTypes(both, 1000, false)).toEqual([]);
  });

  it("needs every switched-on type above it", () => {
    expect(requiredApprovalTypes(both, 1000.01, false)).toEqual([
      "admin",
      "sales_manager",
    ]);
  });

  it("with no threshold, every cart needs them", () => {
    expect(
      requiredApprovalTypes({ ...both, approval_threshold: null }, 1, false)
    ).toEqual(["admin", "sales_manager"]);
  });

  it("a company admin skips the company-admin approval, not the sales manager", () => {
    expect(requiredApprovalTypes(both, 5000, true)).toEqual(["sales_manager"]);
    expect(
      requiredApprovalTypes(
        { ...both, requires_sales_manager_approval: false },
        5000,
        true
      )
    ).toEqual([]);
  });

  it("needs nothing with approvals off or no settings", () => {
    expect(
      requiredApprovalTypes(
        { requires_admin_approval: false, requires_sales_manager_approval: false },
        5000,
        false
      )
    ).toEqual([]);
    expect(requiredApprovalTypes(null, 5000, false)).toEqual([]);
  });
});

describe("assertApprovalsGranted", () => {
  it("passes when nothing is required", () => {
    expect(() => assertApprovalsGranted([], [])).not.toThrow();
  });

  it("needs an approved approval of each required type", () => {
    expect(() => assertApprovalsGranted(["admin"], [])).toThrow(
      "company admin's approval"
    );
    expect(() =>
      assertApprovalsGranted(
        ["admin", "sales_manager"],
        [{ type: "admin", status: "approved" }, { type: "sales_manager", status: "pending" }]
      )
    ).toThrow("sales manager's approval");
    expect(() =>
      assertApprovalsGranted(
        ["admin", "sales_manager"],
        [{ type: "admin", status: "approved" }, { type: "sales_manager", status: "approved" }, null]
      )
    ).not.toThrow();
  });

  it("a rejection ends the cart", () => {
    expect(() =>
      assertApprovalsGranted(["admin"], [{ type: "admin", status: "rejected" }])
    ).toThrow("rejected");
  });
});

describe("assertCartItemsUnlocked", () => {
  it("allows changes with no approvals or after a rejection", () => {
    expect(() => assertCartItemsUnlocked([])).not.toThrow();
    expect(() =>
      assertCartItemsUnlocked([{ type: "admin", status: "rejected" }])
    ).not.toThrow();
  });

  it("locks items while pending and once approved", () => {
    expect(() =>
      assertCartItemsUnlocked([{ type: "admin", status: "pending" }])
    ).toThrow("pending approval");
    expect(() =>
      assertCartItemsUnlocked([{ type: "admin", status: "approved" }, null])
    ).toThrow("approved");
  });
});
