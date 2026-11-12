import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Select, Table, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { adminLink, errorText, STATUS_COLOR } from "../../lib/marketplace"
import { sdk } from "../../lib/sdk"

// Product moderation (TASKS P6-07, BUILD_PLAN §6.6): vendors' products, the
// ones waiting for review first; publish or reject. Reads
// GET /admin/vendor-products; writes POST /admin/vendor-products/:id/review.

type VendorProduct = {
  id: string
  title: string
  handle: string
  status: string
  thumbnail: string | null
  created_at: string
  vendor: { id: string; name: string; status: string }
}

const VendorProductsPage = () => {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("proposed")

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-vendor-products", status],
    queryFn: () =>
      sdk.client.fetch<{ products: VendorProduct[] }>("/admin/vendor-products", {
        query: status === "all" ? {} : { status },
      }),
  })
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "publish" | "reject" }) =>
      sdk.client.fetch(`/admin/vendor-products/${id}/review`, { method: "POST", body: { action } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketplace-vendor-products"] }),
  })

  return (
    <Container className="flex flex-col gap-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Heading>Product moderation</Heading>
          <Text className="text-ui-fg-subtle">
            Vendors' products stay unpublished until you publish them here.
          </Text>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <Select.Trigger className="w-44"><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Item value="proposed">Waiting for review</Select.Item>
            <Select.Item value="draft">Drafts</Select.Item>
            <Select.Item value="published">Published</Select.Item>
            <Select.Item value="rejected">Rejected</Select.Item>
            <Select.Item value="all">All</Select.Item>
          </Select.Content>
        </Select>
      </div>
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {review.error && <Text className="text-ui-fg-error">{errorText(review.error)}</Text>}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : !data?.products.length ? (
        <Text className="text-ui-fg-subtle">No products here.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Product</Table.HeaderCell>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.products.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>
                  <a href={adminLink(`/products/${p.id}`)} className="text-ui-fg-interactive hover:underline">
                    {p.title}
                  </a>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{p.vendor.name}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[p.status]}>{p.status}</Badge>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {p.status !== "published" && (
                    <Button
                      size="small"
                      isLoading={review.isPending}
                      onClick={() => review.mutate({ id: p.id, action: "publish" })}
                    >
                      Publish
                    </Button>
                  )}
                  {p.status !== "rejected" && (
                    <Button
                      size="small"
                      variant="danger"
                      className="ml-2"
                      isLoading={review.isPending}
                      onClick={() => review.mutate({ id: p.id, action: "reject" })}
                    >
                      Reject
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Product moderation",
})

export default VendorProductsPage
