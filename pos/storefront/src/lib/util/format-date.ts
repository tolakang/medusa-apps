// Dates shown to shoppers (owner self-test, 2026-10-07). "06/11/2026" reads
// as 6 November or 11 June depending on the reader, and the server (UTC in
// Docker) and the browser printed different days and times. One unambiguous
// format, always in the shop's time zone (Cambodia).
const SHOP_TIME_ZONE = "Asia/Phnom_Penh"

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: SHOP_TIME_ZONE,
})

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: SHOP_TIME_ZONE,
})

// "6 Nov 2026"
export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value))
}

// "6 Nov 2026, 8:10 am"
export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(new Date(value))
}
