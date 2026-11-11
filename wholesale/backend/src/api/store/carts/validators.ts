import { z } from "@medusajs/framework/zod";

export type StoreAddLineItemsBulkType = z.infer<typeof StoreAddLineItemsBulk>;
export const StoreAddLineItemsBulk = z
  .object({
    line_items: z.array(
      z.object({
        variant_id: z.string(),
        quantity: z.number().int().positive(),
      })
    ).min(1).max(200),
  })
  .strict();
