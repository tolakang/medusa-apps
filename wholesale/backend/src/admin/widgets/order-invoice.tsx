import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { Button, Container, Heading, Text, toast } from "@medusajs/ui";
import { useState } from "react";

// P4-06: download the order's invoice PDF (GET /admin/orders/:id/invoice;
// created on first download if the order has none yet). Same origin and
// admin session as the dashboard, like src/admin/lib/client.ts.
const OrderInvoiceWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/admin/orders/${order.id}/invoice`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const name =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? `invoice-${order.display_id}.pdf`;
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(`Invoice not downloaded: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="flex items-center justify-between px-6 py-4">
      <div>
        <Heading level="h2">Invoice</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          PDF with payment terms and due date
        </Text>
      </div>
      <Button variant="secondary" size="small" isLoading={loading} onClick={download}>
        Download
      </Button>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
});

export default OrderInvoiceWidget;
