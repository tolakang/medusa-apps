import { MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework";
import { authenticate } from "@medusajs/medusa";
import {
  StoreCreateCompany,
  StoreCreateEmployee,
  StoreJoinCompany,
  StoreUpdateApprovalSettings,
  StoreUpdateCompany,
  StoreUpdateEmployee,
} from "./validators";

// P4-07 (F-058): the starter's `/store/companies/:id…` routes took the
// company from the URL and are gone. `/store/companies/me…` takes it from
// the signed-in customer's employee record; the routes check membership and
// the admin flag themselves (src/utils/b2b-access.ts).
export const storeCompaniesMiddlewares: MiddlewareRoute[] = [
  {
    method: "ALL",
    matcher: "/store/companies*",
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    method: ["POST"],
    matcher: "/store/companies",
    middlewares: [validateAndTransformBody(StoreCreateCompany)],
  },
  {
    method: ["POST"],
    matcher: "/store/companies/me",
    middlewares: [validateAndTransformBody(StoreUpdateCompany)],
  },
  {
    method: ["POST"],
    matcher: "/store/companies/me/employees",
    middlewares: [validateAndTransformBody(StoreCreateEmployee)],
  },
  {
    method: ["POST"],
    matcher: "/store/companies/join",
    middlewares: [validateAndTransformBody(StoreJoinCompany)],
  },
  {
    method: ["POST"],
    matcher: "/store/companies/me/employees/:employeeId",
    middlewares: [validateAndTransformBody(StoreUpdateEmployee)],
  },
  {
    method: ["POST"],
    matcher: "/store/companies/me/approval-settings",
    middlewares: [validateAndTransformBody(StoreUpdateApprovalSettings)],
  },
];
