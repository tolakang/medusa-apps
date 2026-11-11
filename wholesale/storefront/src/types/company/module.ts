export enum ModuleCompanySpendingLimitResetFrequency {
  NEVER = "never",
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  YEARLY = "yearly",
}

export type ModuleCompany = {
  id: string
  name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  logo_url: string | null
  currency_code: string | null
  spending_limit_reset_frequency: ModuleCompanySpendingLimitResetFrequency
  // Wholesale terms (backend TASKS P4-02), on the buyer's own company.
  payment_terms?: "prepaid" | "net_15" | "net_30" | "net_60" | null
  credit_limit?: number | null
  tax_id?: string | null
  status?: "pending" | "approved" | "suspended"
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ModuleEmployee = {
  id: string
  company_id: string
  spending_limit: number
  is_admin: boolean
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}
