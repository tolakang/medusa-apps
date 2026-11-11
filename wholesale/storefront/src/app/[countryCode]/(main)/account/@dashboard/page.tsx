import { Metadata } from "next"

import { retrieveCustomer } from "@/lib/data/customer"
import { listOrders } from "@/lib/data/orders"
import JoinCompanyCard from "@/modules/account/components/join-company-card"
import Overview from "@/modules/account/components/overview"
import { retrieveCompany } from "@/lib/data/companies"
import { Container, Text } from "@medusajs/ui"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Account",
  description: "Overview of your account activity.",
}

export default async function OverviewTemplate() {
  const customer = await retrieveCustomer().catch(() => null)
  const company = customer?.employee
    ? await retrieveCompany().catch(() => null)
    : null
  const orders = await listOrders().catch(() => null)

  if (!customer) {
    notFound()
  }

  return (
    <>
      {!customer.employee && <JoinCompanyCard />}
      {company && company.status !== "approved" && (
        // The shop shows products to employees of approved companies only
        // (REVIEW_FIXES X4).
        <Container className="mb-6" data-testid="company-status-notice">
          <Text className="text-neutral-950">
            {company.status === "suspended"
              ? "Your company's account is suspended. Contact us to order again."
              : "Your company's account is waiting for our approval. You can order as soon as it is approved."}
          </Text>
        </Container>
      )}
      <Overview customer={customer} orders={orders} />
    </>
  )
}
