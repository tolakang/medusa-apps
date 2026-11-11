// REVIEW_FIXES B12: a fixed field list, no customer or company records (the
// starter returned `*customer` and `*company`, and took any `?fields=`, which
// let a cart id reach coworkers' emails and phone numbers).
export const cartFields = [
  "id",
  "currency_code",
  "region_id",
  "customer_id",
  "total",
  "subtotal",
  "items.id",
  "items.variant_id",
  "items.product_id",
  "items.title",
  "items.quantity",
  "items.unit_price",
  "items.total",
];

export const retrieveCartTransformQueryConfig = {
  defaults: cartFields,
  isList: false,
};
