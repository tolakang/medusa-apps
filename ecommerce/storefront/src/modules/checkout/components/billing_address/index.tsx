import { HttpTypes } from "@medusajs/types"
import Input from "@modules/common/components/input"
import React, { useState } from "react"
import CountrySelect from "../country-select"
import { phoneInputProps } from "@lib/util/phone"
import { KH_COUNTRY_CODE } from "@lib/util/kh-locations"
import { KhLocationFields } from "@modules/common/components/kh-location-fields"

const BillingAddress = ({ cart }: { cart: HttpTypes.StoreCart | null }) => {
  const [formData, setFormData] = useState<Record<string, string>>({
    "billing_address.first_name": cart?.billing_address?.first_name || "",
    "billing_address.last_name": cart?.billing_address?.last_name || "",
    "billing_address.address_1": cart?.billing_address?.address_1 || "",
    "billing_address.company": cart?.billing_address?.company || "",
    "billing_address.postal_code": cart?.billing_address?.postal_code || "",
    "billing_address.city": cart?.billing_address?.city || "",
    "billing_address.country_code":
      cart?.billing_address?.country_code ||
      (cart?.region?.countries?.length === 1
        ? cart.region.countries[0].iso_2 ?? ""
        : ""),
    "billing_address.province": cart?.billing_address?.province || "",
    "billing_address.phone": cart?.billing_address?.phone || "",
  })

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLInputElement | HTMLSelectElement
    >
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const setField = (name: string, value: string) =>
    setFormData((prev) => ({ ...prev, [name]: value }))

  const input = (
    field: string,
    label: string,
    props: Partial<React.ComponentProps<typeof Input>> & {
      "data-testid"?: string
    } = {}
  ) => (
    <Input
      label={label}
      name={`billing_address.${field}`}
      value={formData[`billing_address.${field}`]}
      onChange={handleChange}
      {...props}
    />
  )
  const firstName = input("first_name", "First name", {
    autoComplete: "given-name",
    required: true,
    "data-testid": "billing-first-name-input",
  })
  const lastName = input("last_name", "Last name", {
    autoComplete: "family-name",
    required: true,
    "data-testid": "billing-last-name-input",
  })
  const address = input("address_1", "Address", {
    autoComplete: "address-line1",
    required: true,
    "data-testid": "billing-address-input",
  })
  const company = input("company", "Company", {
    autoComplete: "organization",
    "data-testid": "billing-company-input",
  })
  const country = (
    <CountrySelect
      name="billing_address.country_code"
      autoComplete="country"
      region={cart?.region}
      value={formData["billing_address.country_code"]}
      onChange={handleChange}
      required
      data-testid="billing-country-select"
    />
  )
  const phone = input("phone", "Phone", {
    ...phoneInputProps,
    "data-testid": "billing-phone-input",
  })

  // Cambodia: same order as the shipping address (TASKS P1-15).
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {formData["billing_address.country_code"] === KH_COUNTRY_CODE ? (
          <>
            {firstName}
            {lastName}
            {address}
            <KhLocationFields
              names={{
                province: "billing_address.province",
                city: "billing_address.city",
                postal_code: "billing_address.postal_code",
              }}
              values={{
                province: formData["billing_address.province"],
                city: formData["billing_address.city"],
                postal_code: formData["billing_address.postal_code"],
              }}
              onChange={(field, value) =>
                setField(`billing_address.${field}`, value)
              }
              testIdPrefix="billing-"
            />
            {country}
            {company}
            {phone}
          </>
        ) : (
          <>
            {firstName}
            {lastName}
            {address}
            {company}
            {input("postal_code", "Postal code", {
              autoComplete: "postal-code",
              required: true,
              "data-testid": "billing-postal-input",
            })}
            {input("city", "City", { autoComplete: "address-level2" })}
            {country}
            {input("province", "State / Province", {
              autoComplete: "address-level1",
              "data-testid": "billing-province-input",
            })}
            {phone}
          </>
        )}
      </div>
    </>
  )
}

export default BillingAddress
