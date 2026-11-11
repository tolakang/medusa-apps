import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows";
import seedInitialData from "../../src/scripts/seed-initial-data";
import { setupB2bCatalog } from "../../src/scripts/seed-b2b";
import { adminHeaders, createAdminUser } from "./admin";

// Shared B2B test setup (P4-05): first boot, the demo seed, the B2B channel
// and key; then helpers for buyers, carts and checkout. Every request
// helper resolves to the response whatever its status.

export const call = (request: Promise<any>) =>
  request.then(
    (res) => res,
    (err) => err.response
  );

export async function setupB2b(api, container) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  await createAdminUser(adminHeaders, container);
  await createShippingProfilesWorkflow(container).run({
    input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
  });
  await createDefaultsWorkflow(container).run();
  await seedInitialData({ container });
  const { publishableKey: key } = await setupB2bCatalog(container);

  const {
    data: [region],
  } = await query.graph({ entity: "region", fields: ["id"] });
  const store = (token?: string) => ({
    headers: {
      "x-publishable-api-key": key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const { data } = await api.get(
    "/store/products?fields=id,variants.id&limit=1&order=handle",
    store()
  );
  const productId: string = data.products[0].id;
  const variantId: string = data.products[0].variants[0].id;

  let emails = 0;
  const register = async () => {
    const email = `buyer${++emails}@b2b.test`;
    const registerToken = (
      await api.post("/auth/customer/emailpass/register", {
        email,
        password: "password",
      })
    ).data.token;
    const { customer } = (
      await api.post(
        "/store/customers",
        { email },
        {
          headers: {
            Authorization: `Bearer ${registerToken}`,
            "x-publishable-api-key": key,
          },
        }
      )
    ).data;
    const token = (
      await api.post("/auth/customer/emailpass", { email, password: "password" })
    ).data.token;
    return { customer, token: token as string };
  };

  const company = async (fields: Record<string, unknown> = {}) => {
    const {
      data: {
        companies: [created],
      },
    } = await api.post(
      "/admin/companies",
      { name: "Acme Wholesale", email: "acme@b2b.test", currency_code: "eur" },
      adminHeaders
    );
    if (Object.keys(fields).length) {
      await api.post(`/admin/companies/${created.id}`, fields, adminHeaders);
    }
    return created as { id: string };
  };

  const employee = async (
    companyId: string,
    fields: Record<string, unknown> = {}
  ) => {
    const buyer = await register();
    // A new session after the employee record (and admin role) exists.
    await api.post(
      `/admin/companies/${companyId}/employees`,
      { customer_id: buyer.customer.id, ...fields },
      adminHeaders
    );
    const token = (
      await api.post("/auth/customer/emailpass", {
        email: buyer.customer.email,
        password: "password",
      })
    ).data.token;
    return { ...buyer, token: token as string };
  };

  const approvalSettings = async (
    companyId: string,
    settings: Record<string, unknown>
  ) => {
    const {
      data: [current],
    } = await query.graph({
      entity: "approval_settings",
      fields: ["id"],
      filters: { company_id: companyId },
    });
    return api.post(
      `/admin/companies/${companyId}/approval-settings`,
      {
        id: current.id,
        requires_admin_approval: false,
        requires_sales_manager_approval: false,
        ...settings,
      },
      adminHeaders
    );
  };

  const cart = (token: string | undefined, quantity: number) =>
    call(
      api.post(
        "/store/carts",
        {
          region_id: region.id,
          email: "orders@b2b.test",
          shipping_address: {
            first_name: "A",
            last_name: "Buyer",
            address_1: "1 Trade St",
            city: "Berlin",
            country_code: "de",
            postal_code: "10115",
          },
          items: [{ variant_id: variantId, quantity }],
        },
        store(token)
      )
    );

  // Shipping, payment (system provider) and completion. Returns the order,
  // or the refusal message.
  const checkout = async (cartId: string, token: string) => {
    const {
      data: { shipping_options },
    } = await api.get(`/store/shipping-options?cart_id=${cartId}`, store(token));
    await call(
      api.post(
        `/store/carts/${cartId}/shipping-methods`,
        { option_id: shipping_options[0].id },
        store(token)
      )
    );
    const {
      data: { payment_collection },
    } = await api.post("/store/payment-collections", { cart_id: cartId }, store(token));
    await api.post(
      `/store/payment-collections/${payment_collection.id}/payment-sessions`,
      { provider_id: "pp_system_default" },
      store(token)
    );
    const res = await call(api.post(`/store/carts/${cartId}/complete`, {}, store(token)));
    if (res.status === 200 && res.data.type === "order") {
      return { order: res.data.order, refused: null as string | null };
    }
    return {
      order: null,
      refused: String(res.data?.error?.message ?? res.data?.message ?? res.status),
    };
  };

  return {
    key,
    regionId: region.id as string,
    productId,
    variantId,
    store,
    register,
    company,
    employee,
    approvalSettings,
    cart,
    checkout,
  };
}
