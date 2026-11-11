import { getAuthHeaders } from "@/lib/data/cookies"
import { NextRequest, NextResponse } from "next/server"

// The invoice PDF of an order (wholesale backend, TASKS P4-06). The backend
// needs the buyer's token, which lives in an httpOnly cookie, so the browser
// downloads through this route. The backend decides who may read it: the
// order's buyer or an admin of their company, 404 for anyone else.
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params
  const auth = await getAuthHeaders()

  if (!("authorization" in auth) || !/^[A-Za-z0-9_]+$/.test(orderId)) {
    return new NextResponse(null, { status: 404 })
  }

  const res = await fetch(`${BACKEND_URL}/store/orders/${orderId}/invoice`, {
    headers: {
      ...auth,
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
    },
    cache: "no-store",
  }).catch(() => null)

  if (!res?.ok || !res.body) {
    return new NextResponse(null, { status: res?.status === 401 ? 401 : 404 })
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        res.headers.get("content-disposition") ??
        `attachment; filename="invoice-${orderId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
