import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  adminHeaders,
  createAdminUser,
  createStoreUser,
} from "../../utils/admin";
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../utils/store";

jest.setTimeout(60 * 1000);

// P4-02 (plan §6.4): payment_terms, credit_limit, tax_id and status on the
// company. Admins set all four; buyers may only give their tax ID.
medusaIntegrationTestRunner({
  env: {
    JWT_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    let storeHeaders;

    const companyInput = {
      name: "Gold Traders",
      email: "buyer@gold.test",
      currency_code: "usd",
    };

    beforeEach(async () => {
      const container = getContainer();
      await createAdminUser(adminHeaders, container);
      const publishableKey = await generatePublishableKey(container);
      storeHeaders = generateStoreHeaders({ publishableKey });
      const { token } = await createStoreUser({ api, storeHeaders });
      storeHeaders.headers["Authorization"] = `Bearer ${token}`;
    });

    it("P4-02: a new company is prepaid, approved, with no credit limit or tax ID", async () => {
      const { data } = await api.post(
        "/admin/companies",
        companyInput,
        adminHeaders
      );

      expect(data.companies[0]).toEqual(
        expect.objectContaining({
          payment_terms: "prepaid",
          status: "approved",
          credit_limit: null,
          tax_id: null,
        })
      );
    });

    it("P4-02: an admin sets payment terms, credit limit, tax ID and status", async () => {
      const {
        data: {
          companies: [company],
        },
      } = await api.post("/admin/companies", companyInput, adminHeaders);

      const { data } = await api.post(
        `/admin/companies/${company.id}`,
        {
          payment_terms: "net_30",
          credit_limit: 5000,
          tax_id: "KH-123456789",
          status: "suspended",
        },
        adminHeaders
      );

      expect(data.company).toEqual(
        expect.objectContaining({
          payment_terms: "net_30",
          credit_limit: 5000,
          tax_id: "KH-123456789",
          status: "suspended",
        })
      );

      // Clearing the credit limit sets it back to "no limit set".
      const { data: cleared } = await api.post(
        `/admin/companies/${company.id}`,
        { credit_limit: null },
        adminHeaders
      );
      expect(cleared.company.credit_limit).toBeNull();
    });

    it("P4-02: unknown payment terms, an unknown status or a negative credit limit are refused", async () => {
      const {
        data: {
          companies: [company],
        },
      } = await api.post("/admin/companies", companyInput, adminHeaders);

      for (const body of [
        { payment_terms: "net_90" },
        { status: "active" },
        { credit_limit: -1 },
      ]) {
        const res = await api
          .post(`/admin/companies/${company.id}`, body, adminHeaders)
          .catch((e) => e.response);
        expect(res.status).toEqual(400);
      }
    });

    it("P4-02: a buyer can give a tax ID but not set terms, credit or status", async () => {
      // Admin-only fields are refused at sign-up (strict schema).
      for (const body of [
        { ...companyInput, payment_terms: "net_60" },
        { ...companyInput, credit_limit: 1000000 },
        { ...companyInput, status: "approved" },
      ]) {
        const res = await api
          .post("/store/companies", body, storeHeaders)
          .catch((e) => e.response);
        expect(res.status).toEqual(400);
      }

      const { data } = await api.post(
        "/store/companies",
        { ...companyInput, tax_id: "KH-987654321" },
        storeHeaders
      );
      // P4-07: the buyer sees their own company's terms.
      expect(data.company).toEqual(
        expect.objectContaining({
          tax_id: "KH-987654321",
          payment_terms: "prepaid",
          status: "approved",
          credit_limit: null,
        })
      );

      // And on update (P4-07: `/store/companies/me`).
      for (const body of [
        { payment_terms: "net_60" },
        { credit_limit: 1000000 },
        { status: "approved" },
      ]) {
        const res = await api
          .post("/store/companies/me", body, storeHeaders)
          .catch((e) => e.response);
        expect(res.status).toEqual(400);
      }

      const updated = await api.post(
        "/store/companies/me",
        { tax_id: "KH-111" },
        storeHeaders
      );
      expect(updated.status).toEqual(200);
      expect(updated.data.company).toEqual(
        expect.objectContaining({
          tax_id: "KH-111",
          payment_terms: "prepaid",
          credit_limit: null,
        })
      );
    });
  },
});
