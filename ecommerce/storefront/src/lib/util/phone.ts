import type { FormEvent } from "react"

// Phone inputs: an optional leading +, then digits with spaces, hyphens or
// parentheses, 8 to 15 digits in total (e.g. 012 345 678 or +855 12 345 678).
// Other characters are dropped as they are typed or pasted; the pattern
// blocks the form on submit; the backend checks the same rule
// (ecommerce/backend/src/lib/phone.ts), so keep the three in step.

export const PHONE_PATTERN = String.raw`\+?[\(\) \-]*(?:[0-9][\(\) \-]*){8,15}`

// Keeps digits, spaces, hyphens, parentheses and one + at the start.
export function cleanPhone(value: string): string {
  const kept = value.replace(/[^0-9+ ()-]/g, "")
  return kept.startsWith("+") ? "+" + kept.slice(1).replace(/\+/g, "") : kept.replace(/\+/g, "")
}

// Runs before React's onChange for the same input event, so controlled
// inputs (checkout) receive the cleaned value too. Keeps the caret in place.
function dropDisallowed(event: FormEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const cleaned = cleanPhone(input.value)
  if (cleaned === input.value) {
    return
  }
  const caret = input.selectionStart ?? input.value.length
  const before = cleanPhone(input.value.slice(0, caret)).length
  input.value = cleaned
  input.setSelectionRange(before, before)
}

export const phoneInputProps = {
  type: "tel",
  inputMode: "tel",
  autoComplete: "tel",
  pattern: PHONE_PATTERN,
  title: "Digits only, for example 012 345 678 or +855 12 345 678.",
  onInput: dropDisallowed,
} as const
