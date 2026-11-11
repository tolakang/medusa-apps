import PaywayReturn from "@/modules/checkout/components/payway-return"
import { Metadata } from "next"

// Where ABA PayWay sends the buyer after paying (continue_success_url,
// TASKS P4-12, as ecommerce P1-03).
export const metadata: Metadata = {
  title: "Confirming payment",
}

export const dynamic = "force-dynamic"

export default function PaywayReturnPage() {
  return <PaywayReturn />
}
