// Form checks for the POS admin pages Cashiers and Registers. React-free so
// the unit runner covers them; the server validates again (api/admin/pos).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type InviteForm = { name: string; email: string }
export type RegisterForm = { name: string; code: string; stock_location_id: string; sales_channel_id: string }

export const inviteBody = (form: InviteForm): InviteForm | null => {
  const name = form.name.trim()
  const email = form.email.trim().toLowerCase()
  return name && name.length <= 100 && EMAIL.test(email) ? { name, email } : null
}

export const registerBody = (form: RegisterForm): RegisterForm | null => {
  const name = form.name.trim()
  const code = form.code.trim()
  if (!name || name.length > 100 || !code || code.length > 50) return null
  if (!form.stock_location_id || !form.sales_channel_id) return null
  return { name, code, stock_location_id: form.stock_location_id, sales_channel_id: form.sales_channel_id }
}
