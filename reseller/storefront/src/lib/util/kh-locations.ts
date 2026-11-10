import { KH_PROVINCES, type KhProvince } from "@lib/data/kh-locations"

// Cambodian addresses (TASKS P1-15): Medusa's `province` holds the
// province/capital and `city` the khan/srok/krong. Matching ignores case,
// spaces, punctuation and the words Khan/Srok/Krong/District/Municipality, and
// works on Khmer names too.

export const KH_COUNTRY_CODE = "kh"

const TYPE_WORDS =
  /\b(khan|srok|krong|district|municipality|province|capital|khaet)\b/g

export function normalizeKh(value: string): string {
  return value
    .toLowerCase()
    .replace(TYPE_WORDS, "")
    .replace(/[\s​'’.,\-()]/g, "")
    .replace(/^(ខេត្ត|រាជធានី|ខណ្ឌ|ស្រុក|ក្រុង)/, "")
}

export type KhOption = {
  value: string
  label: string
  hint: string
  keys: string[]
}

// Options whose names start with the text come first, then ones containing it.
export function matchOptions(options: KhOption[], query: string): KhOption[] {
  const q = normalizeKh(query)
  if (!q) {
    return options
  }
  const starts: KhOption[] = []
  const contains: KhOption[] = []
  for (const option of options) {
    if (option.keys.some((k) => k.startsWith(q))) starts.push(option)
    else if (option.keys.some((k) => k.includes(q))) contains.push(option)
  }
  return [...starts, ...contains]
}

export const provinceOptions: KhOption[] = KH_PROVINCES.map((p) => ({
  value: p.name,
  label: p.name,
  hint: p.name_km,
  keys: [p.name, p.name_km, ...p.aliases].map(normalizeKh),
}))

export function findProvince(
  name: string | null | undefined
): KhProvince | undefined {
  const n = normalizeKh(name ?? "")
  return n ? KH_PROVINCES.find((p) => normalizeKh(p.name) === n) : undefined
}

export function districtOptions(
  provinceName: string | null | undefined
): KhOption[] {
  return (findProvince(provinceName)?.districts ?? []).map((d) => ({
    value: d.name,
    label: d.name,
    hint: d.name_km,
    keys: [d.name, d.name_km].map(normalizeKh),
  }))
}

export function findDistrict(
  provinceName: string | null | undefined,
  name: string | null | undefined
) {
  const n = normalizeKh(name ?? "")
  return n
    ? findProvince(provinceName)?.districts.find(
        (d) => normalizeKh(d.name) === n
      )
    : undefined
}
