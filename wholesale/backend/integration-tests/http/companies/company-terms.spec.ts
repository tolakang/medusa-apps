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
      const { data } = await api.post(
        "/store/companies",
        { ...companyInput, tax_id: "KH-987654321" },
        storeHeaders
      );
      const companyId = data.companies[0].id;

      // The store response doesn't carry the admin-only fields (P4-07 adds
      // them to the buyer's own company); read them as an admin.
      expect(data.companies[0]).not.toHaveProperty("credit_limit");
      const adminRead = async () =>
        (await api.get(`/admin/companies/${companyId}`, adminHeaders)).data
          .company;
      expect(await adminRead()).toEqual(
        expect.objectContaining({
          tax_id: "KH-987654321",
          payment_terms: "prepaid",
          status: "approved",
          credit_limit: null,
        })
      );

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

      // The starter's update route used the raw body; it is validated now.
      for (const body of [
        { payment_terms: "net_60" },
        { credit_limit: 1000000 },
        { status: "approved" },
      ]) {
        const res = await api
          .post(`/store/companies/${companyId}`, body, storeHeaders)
          .catch((e) => e.response);
        expect(res.status).toEqual(400);
      }

      const updated = await api.post(
        `/store/companies/${companyId}`,
        { tax_id: "KH-111" },
        storeHeaders
      );
      expect(updated.status).toEqual(200);
      expect(await adminRead()).toEqual(
        expect.objectContaining({
          tax_id: "KH-111",
          payment_terms: "prepaid",
          credit_limit: null,
        })
      );
    });
  },
});
