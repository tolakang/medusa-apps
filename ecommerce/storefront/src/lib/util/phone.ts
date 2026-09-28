// Phone inputs: an optional leading +, then digits with spaces, hyphens or
// parentheses, 8 to 15 digits in total (e.g. 012 345 678 or +855 12 345 678).
// The browser blocks the form until it matches; the backend checks the same
// rule (ecommerce/backend/src/lib/phone.ts), so keep the two in step.

export const PHONE_PATTERN = String.raw`\+?[\(\) \-]*(?:[0-9][\(\) \-]*){8,15}`

export const phoneInputProps = {
  type: "tel",
  inputMode: "tel",
  autoComplete: "tel",
  pattern: PHONE_PATTERN,
  title: "Digits only, for example 012 345 678 or +855 12 345 678.",
} as const
