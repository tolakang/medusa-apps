import type { FormEvent } from "react"

// Phone inputs: an optional leading +, then digits with spaces, hyphens or
// parentheses, 8 to 15 digits in total (e.g. 012 345 678 or +855 12 345 678).
// Other characters are dropped and Cambodian numbers are spaced as they are
// typed or pasted; the pattern
// blocks the form on submit; the backend checks the same rule
// (pos/backend/src/lib/phone.ts), so keep the three in step.

export const PHONE_PATTERN = String.raw`\+?[\(\) \-]*(?:[0-9][\(\) \-]*){8,15}`

// Keeps digits, spaces, hyphens, parentheses and one + at the start.
export function cleanPhone(value: string): string {
  const kept = value.replace(/[^0-9+ ()-]/g, "")
  return kept.startsWith("+")
    ? "+" + kept.slice(1).replace(/\+/g, "")
    : kept.replace(/\+/g, "")
}

// Cambodian numbers are grouped as they are usually written (owner, TASKS
// P1-15): 012 345 678, 097 123 4567, +855 12 345 678 (the 0 after +855 is
// dropped). Other numbers are only cleaned.
function group(digits: string, sizes: number[]): string {
  const parts: string[] = []
  let i = 0
  for (const size of sizes) {
    if (i >= digits.length) break
    parts.push(digits.slice(i, i + size))
    i += size
  }
  if (i < digits.length) parts.push(digits.slice(i))
  return parts.join(" ")
}

export function formatPhone(value: string): string {
  const cleaned = cleanPhone(value)
  const digits = cleaned.replace(/\D/g, "")
  if (cleaned.startsWith("+")) {
    if (!digits.startsWith("855")) {
      return cleaned
    }
    const rest = digits.slice(3).replace(/^0+/, "")
    const sizes = rest.length > 8 ? [2, 3, 4] : [2, 3, 3]
    return rest ? `+855 ${group(rest, sizes)}` : "+855"
  }
  if (digits.startsWith("0")) {
    return group(digits, digits.length > 9 ? [3, 3, 4] : [3, 3, 3])
  }
  return cleaned
}

const previous = new WeakMap<HTMLInputElement, string>()

// Runs before React's onChange for the same input event, so controlled
// inputs (checkout) receive the formatted value too. The caret stays after
// the same number of digits; deleting a space deletes the digit before it.
function formatOnInput(event: FormEvent<HTMLInputElement>) {
  const input = event.currentTarget
  let raw = input.value
  let caret = input.selectionStart ?? raw.length
  const before = previous.get(input) ?? ""
  const deleting =
    (event.nativeEvent as InputEvent).inputType === "deleteContentBackward"
  if (
    deleting &&
    raw.replace(/\D/g, "") === before.replace(/\D/g, "") &&
    caret > 0
  ) {
    // Only a space was removed: remove the digit before it as well.
    const digitAt = raw.slice(0, caret).search(/\d(?=\D*$)/)
    if (digitAt >= 0) {
      raw = raw.slice(0, digitAt) + raw.slice(digitAt + 1)
      caret = digitAt
    }
  }
  const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length
  const dropsZero =
    /^\+?855\D*0/.test(cleanPhone(raw)) && digitsBeforeCaret > 3 ? 1 : 0
  const formatted = formatPhone(raw)
  previous.set(input, formatted)
  if (formatted === input.value) {
    return
  }
  input.value = formatted
  let seen = 0
  let pos = 0
  const target = digitsBeforeCaret - dropsZero
  while (pos < formatted.length && seen < target) {
    if (/\d/.test(formatted[pos])) seen++
    pos++
  }
  if (target <= 0 && formatted.startsWith("+"))
    pos = Math.min(1, formatted.length)
  input.setSelectionRange(pos, pos)
}

export const phoneInputProps = {
  type: "tel",
  inputMode: "tel",
  autoComplete: "tel",
  pattern: PHONE_PATTERN,
  title: "Digits only, for example 012 345 678 or +855 12 345 678.",
  onInput: formatOnInput,
} as const
