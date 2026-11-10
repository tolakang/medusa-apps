/* Entity: Company */

import { CustomerGroupDTO } from "@medusajs/framework/types";
import { CustomerDTO } from "@medusajs/framework/types";
import { ModuleApprovalSettings } from "../approval/module";

export enum ModuleCompanySpendingLimitResetFrequency {
  NEVER = "never",
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  YEARLY = "yearly",
}

export enum ModuleCompanyPaymentTerms {
  PREPAID = "prepaid",
  NET_15 = "net_15",
  NET_30 = "net_30",
  NET_60 = "net_60",
}

export enum ModuleCompanyStatus {
  PENDING = "pending",
  APPROVED = "approved",
  SUSPENDED = "suspended",
}

export type ModuleCompany = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  logo_url: string | null;
  currency_code: string | null;
  spending_limit_reset_frequency: ModuleCompanySpendingLimitResetFrequency;
  payment_terms: ModuleCompanyPaymentTerms;
  credit_limit: number | null;
  tax_id: string | null;
  status: ModuleCompanyStatus;
  created_at: Date;
  updated_at: Date;
  customer_group: CustomerGroupDTO;
  approval_settings: ModuleApprovalSettings;
};

export type ModuleCreateCompany = {
  name: string;
  phone: string;
  email: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  logo_url: string | null;
  currency_code: string;
  spending_limit_reset_frequency: ModuleCompanySpendingLimitResetFrequency | null;
  payment_terms?: ModuleCompanyPaymentTerms;
  credit_limit?: number | null;
  tax_id?: string | null;
  status?: ModuleCompanyStatus;
};

export interface ModuleUpdateCompany extends Partial<ModuleCompany> {
  id: string;
}

export type ModuleDeleteCompany = {
  id: string;
};

/* Entity: Employee */

export interface ModuleEmployee {
  id: string;
  spending_limit: number;
  is_admin: boolean;
  company_id: string;
  created_at: Date;
  updated_at: Date;
  customer: CustomerDTO;
  company: ModuleCompany;
}

export type ModuleCreateEmployee = {
  customer_id: string;
  spending_limit: number;
  is_admin: boolean;
  company_id: string;
};

export interface ModuleUpdateEmployee extends Partial<ModuleEmployee> {
  id: string;
}

export type ModuleDeleteEmployee = {
  id: string;
};
