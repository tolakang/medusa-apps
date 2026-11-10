import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"

// Tells uploaders the image rules before they pick a file (TASKS P1-13). The
// dashboard's media form accepts SVG and, when editing media, replaces the
// server's upload error with a generic one (@medusajs/dashboard 2.21.1
// product-media), so the rules are shown up front. Same data and query key as
// the Settings → Store widget, so it always shows the current limit.

type UploadLimit = { limit_mb: number }

const ProductImageRulesWidget = () => {
  const { data } = useQuery({
    queryKey: ["upload-limit"],
    queryFn: () => sdk.client.fetch<{ upload_limit: UploadLimit }>("/admin/upload-limit"),
  })
  const limit = data?.upload_limit.limit_mb

  return (
    <Container className="px-6 py-3">
      <Text size="small" className="text-ui-fg-subtle">
        <span className="text-ui-fg-base font-medium">Product images:</span> JPEG, PNG or
        WebP{limit !== undefined ? `, max ${limit} MB each` : ""} (about 1600 px on the
        longest side). SVG is not allowed. A file that breaks these rules is refused
        when you save, and the whole save fails.
      </Text>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: ["product.details.before", "product.list.before"],
})

export default ProductImageRulesWidget
