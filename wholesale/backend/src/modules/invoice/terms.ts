// P4-06: when an invoice is due. Prepaid is due on the order date (paid at
// checkout); net terms are due that many days later.
export const PAYMENT_TERM_DAYS: Record<string, number> = {
  prepaid: 0,
  net_15: 15,
  net_30: 30,
  net_60: 60,
};

export function invoiceDueDate(issuedAt: Date, paymentTerms?: string | null) {
  const days = PAYMENT_TERM_DAYS[paymentTerms ?? "prepaid"] ?? 0;
  const due = new Date(issuedAt);
  due.setUTCDate(due.getUTCDate() + days);
  return due;
}

export const invoiceNumber = (displayId: number) =>
  `INV-${String(displayId).padStart(6, "0")}`;
