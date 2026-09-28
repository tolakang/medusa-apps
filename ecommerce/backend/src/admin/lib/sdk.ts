import Medusa from "@medusajs/js-sdk"

// JS SDK for admin customizations, as in Medusa's "Admin Development Tips":
// session auth, same backend that serves the admin. The docs' `debug:
// import.meta.env.DEV` is left out: the backend's root tsconfig (same as the
// dtc-starter's) also typechecks src/admin as CommonJS, where import.meta fails.
export const sdk = new Medusa({
  baseUrl: __BACKEND_URL__ || "/",
  auth: {
    type: "session",
  },
})
