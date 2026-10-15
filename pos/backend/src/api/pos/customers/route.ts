import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { CustomerDTO } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { parsePosQuery } from "../../pos-query"
import { GetPosCustomers, type PostPosCustomerType } from "../validators"

// GET/POST /pos/customers (TASKS P2-06): customer lookup at the till (name,
// email or phone; the customer module's `q` searches those fields) and a new
// customer for a walk-in buyer who wants the sale on their account.

const pick = (c: CustomerDTO) => ({
  id: c.id,
  first_name: c.first_name ?? null,
  last_name: c.last_name ?? null,
  email: c.email ?? null,
  phone: c.phone ?? null,
  has_account: c.has_account,
})

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { q, limit } = parsePosQuery(GetPosCustomers, req.query)
  const customers = await req.scope
    .resolve(Modules.CUSTOMER)
    .listCustomers({ q }, { take: limit, order: { first_name: "ASC" } })
  res.json({ customers: customers.map(pick) })
}

export const POST = async (req: AuthenticatedMedusaRequest<PostPosCustomerType>, res: MedusaResponse) => {
  const body = req.validatedBody
  const email = body.email?.toLowerCase()
  if (email) {
    const [existing] = await req.scope.resolve(Modules.CUSTOMER).listCustomers({ email })
    if (existing) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "A customer with this email already exists. Search for them instead.")
    }
  }
  const { result } = await createCustomersWorkflow(req.scope).run({
    input: {
      customersData: [
        {
          first_name: body.first_name,
          last_name: body.last_name ?? null,
          phone: body.phone ?? null,
          email: email ?? null,
          created_by: req.auth_context.actor_id,
        },
      ],
    },
  })
  res.status(201).json({ customer: pick(result[0]) })
}
