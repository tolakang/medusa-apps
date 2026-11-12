"use client"

import { HttpTypes } from "@medusajs/types"

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
}

// The sign-in email (owner, 2026-10-06). The starter's editor showed
// "updated" without saving anything: Medusa's store API can't change the
// email an account signs in with, so it is shown read-only.
const ProfileEmail = ({ customer }: MyInformationProps) => (
  <div className="text-small-regular" data-testid="account-email-editor">
    <div className="flex flex-col">
      <span className="uppercase text-ui-fg-base">Email</span>
      <span className="font-semibold" data-testid="current-info">
        {customer.email}
      </span>
      <span className="text-ui-fg-subtle mt-1">
        This is the email you sign in with. Contact us to change it.
      </span>
    </div>
  </div>
)

export default ProfileEmail
