import { FindParams, PaginatedResponse } from "@medusajs/framework/types";
import { QueryCompany, QueryEmployee } from "./query";
import { ModuleCompanyFilters, ModuleEmployeeFilters } from "./service";
import {
  ModuleCompanyPaymentTerms,
  ModuleCompanySpendingLimitResetFrequency,
  ModuleCompanyStatus,
} from "./module";

/* Filters */

export interface CompanyFilterParams extends FindParams, ModuleCompanyFilters {}

export interface EmployeeFilterParams
  extends FindParams,
    ModuleEmployeeFilters {}

/* Admin */

/* Company */
export type AdminCompanyResponse = {
  company: QueryCompany;
};

export type AdminCompaniesResponse = PaginatedResponse<{
  companies: QueryCompany[];
}>;

export type AdminCreateCompany = {
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
  payment_terms?: `${ModuleCompanyPaymentTerms}`;
  credit_limit?: number | null;
  tax_id?: string | null;
  status?: `${ModuleCompanyStatus}`;
};

export type AdminUpdateCompany = Partial<AdminCreateCompany>;

/* Employee */

export type AdminEmployeeResponse = {
  employee: QueryEmployee;
};

export type AdminEmployeesResponse = PaginatedResponse<{
  employees: QueryEmployee[];
}>;

export type AdminCreateEmployee = {
  spending_limit: number;
  is_admin: boolean;
  company_id: string;
  customer_id: string;
};

export type AdminUpdateEmployee = Partial<AdminCreateEmployee>;

/* Store */

/* Company */

export type StoreCompanyResponse = {
  company: QueryCompany;
};

export type StoreCompaniesResponse = PaginatedResponse<{
  companies: QueryCompany[];
}>;

export type StoreCompanyPreviewResponse = {
  company: QueryCompany;
};

export type StoreCreateCompany = {
  name: string;
  phone?: string | null;
  email: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  logo_url?: string | null;
  currency_code: string;
  tax_id?: string | null;
};

export type StoreUpdateCompany = {
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
  currency_code: string;
  spending_limit_reset_frequency?: ModuleCompanySpendingLimitResetFrequency;
  tax_id?: string | null;
};

/* Employee */

export type StoreEmployeeResponse = {
  employee: QueryEmployee;
};

export type StoreEmployeesResponse = PaginatedResponse<{
  employees: QueryEmployee[];
}>;

export type StoreCreateEmployee = {
  customer_id: string;
  spending_limit: number;
  is_admin: boolean;
  company_id: string;
};

export type StoreUpdateEmployee = {
  id: string;
  spending_limit: number;
  is_admin: boolean;
  company_id: string;
};
