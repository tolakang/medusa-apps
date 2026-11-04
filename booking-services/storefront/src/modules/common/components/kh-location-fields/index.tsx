"use client"

import Combobox from "@modules/common/components/combobox"
import Input from "@modules/common/components/input"
import {
  districtOptions,
  findDistrict,
  findProvince,
  provinceOptions,
} from "@lib/util/kh-locations"
import { useMemo, useState } from "react"

// Province / Capital → Khan / Srok → Postal code for Cambodian addresses
// (TASKS P1-15). Values go into Medusa's `province`, `city` and `postal_code`.
// Picking a province limits the khan/srok list to it; picking a khan/srok
// fills in its official postal code (still editable). Renders three grid cells.

export type KhLocationValues = {
  province: string
  city: string
  postal_code: string
}

type Props = {
  names: { province: string; city: string; postal_code: string }
  values: KhLocationValues
  onChange: (field: keyof KhLocationValues, value: string) => void
  testIdPrefix?: string
}

export function KhLocationFields({
  names,
  values,
  onChange,
  testIdPrefix = "",
}: Props) {
  const districts = useMemo(
    () => districtOptions(values.province),
    [values.province]
  )
  const hasProvince = !!findProvince(values.province)

  // A postal code we filled in follows its khan/srok; one the customer typed stays.
  const autoPostal = findDistrict(values.province, values.city)?.postal_code
  const isAutoPostal = !!autoPostal && values.postal_code === autoPostal

  const setProvince = (province: string) => {
    onChange("province", province)
    if (values.city && !findDistrict(province, values.city)) {
      onChange("city", "")
      if (isAutoPostal) {
        onChange("postal_code", "")
      }
    }
  }

  const setCity = (city: string) => {
    onChange("city", city)
    const postal = findDistrict(values.province, city)?.postal_code
    if (postal) {
      onChange("postal_code", postal)
    } else if (isAutoPostal) {
      onChange("postal_code", "")
    }
  }

  return (
    <>
      <Combobox
        label="Province / Capital"
        name={names.province}
        value={values.province}
        options={provinceOptions}
        onChange={setProvince}
        required
        invalidMessage="Choose a province or the capital from the list."
        data-testid={`${testIdPrefix}province-input`}
      />
      <Combobox
        label="Khan / Srok"
        name={names.city}
        value={values.city}
        options={districts}
        onChange={setCity}
        required
        disabled={!hasProvince}
        invalidMessage="Choose a khan or srok from the list."
        data-testid={`${testIdPrefix}city-input`}
      />
      <Input
        label="Postal code"
        name={names.postal_code}
        autoComplete="postal-code"
        inputMode="numeric"
        value={values.postal_code}
        onChange={(e) => onChange("postal_code", e.target.value)}
        data-testid={`${testIdPrefix}postal-code-input`}
      />
    </>
  )
}

// For forms that don't keep their own state (account addresses).
export function KhLocationFieldsWithState({
  names,
  defaults,
  testIdPrefix,
}: {
  names: Props["names"]
  defaults?: Partial<KhLocationValues>
  testIdPrefix?: string
}) {
  const [values, setValues] = useState<KhLocationValues>({
    province: defaults?.province ?? "",
    city: defaults?.city ?? "",
    postal_code: defaults?.postal_code ?? "",
  })
  return (
    <KhLocationFields
      names={names}
      values={values}
      onChange={(field, value) => setValues((v) => ({ ...v, [field]: value }))}
      testIdPrefix={testIdPrefix}
    />
  )
}
