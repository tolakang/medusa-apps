// Phone numbers entered by shoppers (checkout and account addresses). Medusa
// 2.21.1 accepts any string (`phone: z.string().nullish()` in the store
// validators), so letters were saved. Allowed: an optional leading +, then
// digits with spaces, hyphens or parentheses, 8 to 15 digits in total
// (E.164 allows at most 15; Cambodian numbers are 9–10 digits with the 0,
// e.g. 012 345 678 or +855 12 345 678). Empty means no phone (optional).
// Keep in step with the storefront's src/lib/util/phone.ts.

export const PHONE_MESSAGE =
  "Enter a phone number with digits only, for example 012 345 678 or +855 12 345 678."

export function isValidPhone(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return true
  }
  if (typeof value !== "string" || !/^\+?[0-9 ()-]+$/.test(value.trim())) {
    return false
  }
  const digits = value.replace(/\D/g, "").length
  return digits >= 8 && digits <= 15
}
