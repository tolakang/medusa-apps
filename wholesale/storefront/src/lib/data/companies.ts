"use server"

import { sdk } from "@/lib/config"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
} from "@/lib/data/cookies"
import {
  StoreCompaniesResponse,
  StoreCompanyResponse,
  StoreCreateCompany,
  StoreEmployeeResponse,
  StoreUpdateCompany,
  StoreUpdateEmployee,
  QueryCompany,
  QueryEmployee,
} from "@/types"
import { track } from "@vercel/analytics/server"
import { revalidateTag } from "next/cache"

// The buyer's own company, taken from their employee record on the backend
// (TASKS P4-07: `/store/companies/me`; the starter's `/store/companies/:id`
// routes are gone). The employee list with names comes from its own route.
export const retrieveCompany = async (_companyId?: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("companies")),
  }

  const [{ company }, { employees }] = await Promise.all([
    sdk.client.fetch<StoreCompanyResponse>(`/store/companies/me`, {
      method: "GET",
      headers,
      next,
    }),
    sdk.client.fetch<{ employees: QueryEmployee[] }>(
      `/store/companies/me/employees`,
      { method: "GET", headers, next }
    ),
  ])

  return { ...company, employees }
}

export const createCompany = async (data: StoreCreateCompany) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const {
    companies: [company],
  } = await sdk.client.fetch<StoreCompaniesResponse>(`/store/companies`, {
    method: "POST",
    body: data,
    headers,
  })

  track("company_created", {
    company_id: company.id,
    company_name: company.name,
  })

  const cacheTag = await getCacheTag("companies")
  revalidateTag(cacheTag, { expire: 0 })

  return company
}

export const updateCompany = async (data: StoreUpdateCompany) => {
  // The backend takes the company from the signed-in employee, not from an id.
  const { id: _id, ...companyData } = data

  const headers = {
    ...(await getAuthHeaders()),
  }

  const company = await sdk.client.fetch<StoreCompanyResponse>(
    `/store/companies/me`,
    {
      method: "POST",
      body: companyData,
      headers,
    }
  )

  const cacheTag = await getCacheTag("companies")
  revalidateTag(cacheTag, { expire: 0 })

  return company
}

// A company admin invites a colleague by email and gets a join code to give
// them; nobody is added until the colleague joins with it (REVIEW_FIXES B14).
export const inviteEmployee = async (
  email: string
): Promise<{ join_code?: string; error?: string }> => {
  try {
    const { invitation } = await sdk.client.fetch<{
      invitation: { email: string; join_code: string }
    }>(`/store/companies/me/employees`, {
      method: "POST",
      body: { email },
      headers: { ...(await getAuthHeaders()) },
    })
    return { join_code: invitation.join_code }
  } catch (e) {
    return { error: (e as Error)?.message || "Couldn't make a join code." }
  }
}

// The signed-in customer joins a company with a colleague's join code.
export const joinCompany = async (
  joinCode: string
): Promise<{ company?: QueryCompany; error?: string }> => {
  try {
    const { company } = await sdk.client.fetch<{ company: QueryCompany }>(
      `/store/companies/join`,
      {
        method: "POST",
        body: { join_code: joinCode },
        headers: { ...(await getAuthHeaders()) },
      }
    )
    const customerTag = await getCacheTag("customers")
    revalidateTag(customerTag, { expire: 0 })
    const companiesTag = await getCacheTag("companies")
    revalidateTag(companiesTag, { expire: 0 })
    return { company }
  } catch (e) {
    return { error: (e as Error)?.message || "Couldn't join the company." }
  }
}

export const updateEmployee = async (data: StoreUpdateEmployee) => {
  // Strict schema on the backend: only these two fields may be sent.
  const { id, spending_limit, is_admin } = data

  const headers = {
    ...(await getAuthHeaders()),
  }

  const employee = await sdk.client.fetch<StoreEmployeeResponse>(
    `/store/companies/me/employees/${id}`,
    {
      method: "POST",
      body: { spending_limit, is_admin },
      headers,
    }
  )

  const cacheTag = await getCacheTag("companies")
  revalidateTag(cacheTag, { expire: 0 })

  return employee
}

export const deleteEmployee = async (
  _companyId: string,
  employeeId: string
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.client.fetch(
    `/store/companies/me/employees/${employeeId}`,
    {
      method: "DELETE",
      headers,
    }
  )

  const cacheTag = await getCacheTag("companies")
  revalidateTag(cacheTag, { expire: 0 })
}

export const updateApprovalSettings = async (
  _companyId: string,
  requiresAdminApproval: boolean
) => {
  const headers = {
    ...(await getAuthHeaders()),
    "Content-Type": "application/json",
    Accept: "plain/text",
  }

  await sdk.client.fetch(`/store/companies/me/approval-settings`, {
    method: "POST",
    body: {
      requires_admin_approval: requiresAdminApproval,
    },
    headers,
  })

  const cacheTag = await getCacheTag("companies")
  revalidateTag(cacheTag, { expire: 0 })
}
