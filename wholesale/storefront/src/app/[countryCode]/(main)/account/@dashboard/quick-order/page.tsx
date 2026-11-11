import QuickOrderForm from "@/modules/account/components/quick-order-form"
import { Heading, Text } from "@medusajs/ui"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Quick order",
  description: "Add many items to your cart by SKU.",
}

export default function QuickOrder() {
  return (
    <div className="w-full" data-testid="quick-order-page-wrapper">
      <div className="mb-4 flex flex-col gap-y-2">
        <Heading>Quick order</Heading>
        <Text className="text-neutral-700">
          Type or paste one item per line as <code>SKU, quantity</code>, or
          upload a CSV file with those two columns.
        </Text>
      </div>
      <QuickOrderForm />
    </div>
  )
}
