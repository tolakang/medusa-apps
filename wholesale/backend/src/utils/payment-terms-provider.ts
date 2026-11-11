import { MedusaError } from "@medusajs/framework/utils";

// TASKS P4-12 (owner D9): prepaid companies pay online through ABA PayWay
// (KHQR, cards); companies on net terms buy on invoice through the system
// provider and pay later (P4-06). When PayWay isn't set up
// (PAYWAY_MERCHANT_ID / PAYWAY_API_KEY empty), everyone uses the system
// provider, as before.

export const PAYWAY_PROVIDER_ID = "pp_payway_payway";
export const INVOICE_PROVIDER_ID = "pp_system_default";

export const paywayConfigured = (env: NodeJS.ProcessEnv = process.env) =>
  !!(env.PAYWAY_MERCHANT_ID && env.PAYWAY_API_KEY);

export const PREPAID_PAY_ONLINE_MESSAGE =
  "Your company pays when it orders: please pay with ABA PayWay (KHQR or card).";
export const NET_TERMS_ON_INVOICE_MESSAGE =
  "Your company buys on payment terms: please choose Pay by invoice.";

/** The payment providers a company may use (null: no rule, any). */
export function allowedProviders(
  paymentTerms: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): string[] | null {
  if (!paywayConfigured(env)) {
    return null;
  }
  return !paymentTerms || paymentTerms === "prepaid"
    ? [PAYWAY_PROVIDER_ID]
    : [INVOICE_PROVIDER_ID];
}

/** Throws when this company may not pay with this provider. */
export function assertProviderForTerms(
  providerId: string | null | undefined,
  paymentTerms: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
) {
  const allowed = allowedProviders(paymentTerms, env);
  if (!allowed || !providerId || allowed.includes(providerId)) {
    return;
  }
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    allowed.includes(PAYWAY_PROVIDER_ID)
      ? PREPAID_PAY_ONLINE_MESSAGE
      : NET_TERMS_ON_INVOICE_MESSAGE
  );
}
