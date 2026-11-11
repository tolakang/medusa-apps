import {
  allowedProviders,
  assertProviderForTerms,
  INVOICE_PROVIDER_ID,
  PAYWAY_PROVIDER_ID,
} from "../payment-terms-provider";

describe("payment provider by payment terms (TASKS P4-12)", () => {
  const withPayway = { PAYWAY_MERCHANT_ID: "ec000002", PAYWAY_API_KEY: "key" };

  it("prepaid pays with PayWay, net terms on invoice", () => {
    expect(allowedProviders("prepaid", withPayway)).toEqual([PAYWAY_PROVIDER_ID]);
    expect(allowedProviders(null, withPayway)).toEqual([PAYWAY_PROVIDER_ID]);
    for (const terms of ["net_15", "net_30", "net_60"]) {
      expect(allowedProviders(terms, withPayway)).toEqual([INVOICE_PROVIDER_ID]);
    }
    expect(() => assertProviderForTerms(INVOICE_PROVIDER_ID, "prepaid", withPayway)).toThrow(
      "ABA PayWay"
    );
    expect(() => assertProviderForTerms(PAYWAY_PROVIDER_ID, "net_30", withPayway)).toThrow(
      "Pay by invoice"
    );
    expect(() => assertProviderForTerms(PAYWAY_PROVIDER_ID, "prepaid", withPayway)).not.toThrow();
  });

  it("without PayWay set up, there is no rule", () => {
    expect(allowedProviders("prepaid", {})).toBeNull();
    expect(() => assertProviderForTerms(INVOICE_PROVIDER_ID, "prepaid", {})).not.toThrow();
  });
});
