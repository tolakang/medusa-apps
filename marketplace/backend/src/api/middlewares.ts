import {
  configureStoreSearch,
  defineMiddlewares,
  validateAndTransformBody,
} from '@medusajs/framework/http'
import { PostAdminUploadLimit } from './admin/upload-limit/validators'
import { PostCustomerPassword } from './store/customers/me/password/validators'
import { PostWishlistItem } from './store/customers/me/wishlists/items/validators'
import {
  requireContact,
  requireContactBeforePayment,
  validatePhoneFields,
} from './contact-validation'
import { enforceUploadLimits } from './upload-limits'
import {
  AUTH_LIMITS,
  limitPerIp,
  limitVerificationEmails,
  requireCaptcha,
  requireStrongPassword,
} from './auth-guards'
import { requireVendor, vendorCors } from './vendor-auth'
import { refuseExistingInventoryItems, refuseVendorOrderMetadata } from './marketplace-guards'
import { PostVendorCreate } from './vendors/validators'
import { PostVendorProductStock } from './vendors/products/[id]/stock/route'
import { AdminCreateProduct } from '@medusajs/medusa/api/admin/products/validators'
import { PostAdminVendor } from './admin/vendors/validators'
import { PostAdminVendorPayoutPay } from './admin/vendor-payouts/validators'
import { PostAdminVendorProductReview } from './admin/vendor-products/validators'
import { PostAdminVendorCommissionSettle } from './admin/vendor-commissions/validators'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      // Vendor portal routes (TASKS P6-03): VENDOR_CORS, then a signed-in
      // vendor admin of an active vendor on every /vendors route
      // (vendor-auth.ts); sign-up (POST /vendors) takes a registration token.
      matcher: '/vendors*',
      middlewares: [vendorCors, requireVendor],
    },
    {
      method: ['POST'],
      matcher: '/vendors',
      middlewares: [
        limitPerIp('vendor_create', AUTH_LIMITS.signup, 60),
        validateAndTransformBody(PostVendorCreate),
      ],
    },
    {
      // A vendor sets a product's stock (F-080, P6-15).
      method: ['POST'],
      matcher: '/vendors/products/:id/stock',
      middlewares: [validateAndTransformBody(PostVendorProductStock)],
    },
    {
      // A vendor adds a product (TASKS P6-04): the admin's product body, as
      // in the official Vendors example, without links to existing
      // inventory items (review 2, A1).
      method: ['POST'],
      matcher: '/vendors/products',
      middlewares: [refuseExistingInventoryItems, validateAndTransformBody(AdminCreateProduct)],
    },
    {
      // Vendor sign-up and sign-in: the same per-IP limits and password rule
      // as customers. A new vendor waits for the admin's approval.
      method: ['POST'],
      matcher: '/auth/vendor/emailpass/register',
      middlewares: [limitPerIp('vendor_signup', AUTH_LIMITS.signup, 60), requireStrongPassword],
    },
    {
      method: ['POST'],
      matcher: '/auth/vendor/emailpass',
      middlewares: [limitPerIp('vendor_login', AUTH_LIMITS.login, 60)],
    },
    {
      method: ['POST'],
      matcher: '/auth/vendor/emailpass/reset-password',
      middlewares: [limitPerIp('vendor_password_reset', AUTH_LIMITS.password_reset, 60)],
    },
    {
      method: ['POST'],
      matcher: '/admin/vendor-commissions/:id/settle',
      middlewares: [validateAndTransformBody(PostAdminVendorCommissionSettle)],
    },
    {
      method: ['POST'],
      matcher: '/admin/vendor-products/:id/review',
      middlewares: [validateAndTransformBody(PostAdminVendorProductReview)],
    },
    {
      method: ['POST'],
      matcher: '/admin/vendor-payouts/:id/pay',
      middlewares: [validateAndTransformBody(PostAdminVendorPayoutPay)],
    },
    {
      method: ['POST'],
      matcher: '/admin/vendors/:id',
      middlewares: [validateAndTransformBody(PostAdminVendor)],
    },
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
    {
      // Size and type limits for admin uploads (TASKS P1-11).
      method: ['POST'],
      matcher: '/admin/uploads',
      middlewares: [enforceUploadLimits],
    },
    {
      // Admin setting for the upload limit (TASKS P1-12).
      method: ['POST'],
      matcher: '/admin/upload-limit',
      middlewares: [validateAndTransformBody(PostAdminUploadLimit)],
    },
    {
      // Phone numbers: digits only (spaces, +, -, parentheses allowed).
      method: ['POST'],
      matcher: '/store/carts/:id',
      middlewares: [validatePhoneFields, refuseVendorOrderMetadata],
    },
    {
      // The vendor split's own order metadata keys (review 2, M4).
      method: ['POST'],
      matcher: '/store/carts',
      middlewares: [refuseVendorOrderMetadata],
    },
    {
      // Required contact before the order is placed: the delivery phone in
      // Cambodia, the email elsewhere.
      method: ['POST'],
      matcher: '/store/carts/:id/complete',
      middlewares: [requireContact],
    },
    {
      // The same check before a payment starts (PayWay can complete the
      // cart from its callback).
      method: ['POST'],
      matcher: '/store/payment-collections/:id/payment-sessions',
      middlewares: [requireContactBeforePayment],
    },
    {
      // Change password while signed in (current + new, at least 8).
      method: ['POST'],
      matcher: '/store/customers/me/password',
      middlewares: [
        limitPerIp('password_change', AUTH_LIMITS.password_change, 60),
        validateAndTransformBody(PostCustomerPassword),
      ],
    },
    {
      // Wishlist item body (TASKS P1-19).
      method: ['POST'],
      matcher: '/store/customers/me/wishlists/items',
      middlewares: [validateAndTransformBody(PostWishlistItem)],
    },
    {
      // Customer passwords: at least 8 characters at sign-up and reset.
      method: ['POST'],
      matcher: '/auth/customer/emailpass/register',
      middlewares: [limitPerIp('signup', AUTH_LIMITS.signup, 60), requireCaptcha('signup'), requireStrongPassword],
    },
    {
      method: ['POST'],
      matcher: '/auth/customer/emailpass/update',
      middlewares: [requireStrongPassword],
    },
    {
      // REVIEW_FIXES B17: the same password rule when an admin sets a new one.
      method: ['POST'],
      matcher: '/auth/user/emailpass/update',
      middlewares: [requireStrongPassword],
    },
    {
      // Admin sign-in and forgot password (pre-deploy audit E-A1): the same
      // per-IP limits as the customer routes. The admin dashboard calls the
      // backend from the browser, so req.ip is the admin's address.
      method: ['POST'],
      matcher: '/auth/user/emailpass',
      middlewares: [limitPerIp('admin_login', AUTH_LIMITS.login, 60)],
    },
    {
      method: ['POST'],
      matcher: '/auth/user/emailpass/reset-password',
      middlewares: [limitPerIp('admin_password_reset', AUTH_LIMITS.password_reset, 60)],
    },
    {
      // CAPTCHA on customer sign-in and forgot password (sign-up above).
      method: ['POST'],
      matcher: '/auth/customer/emailpass',
      middlewares: [limitPerIp('login', AUTH_LIMITS.login, 60), requireCaptcha('login')],
    },
    {
      method: ['POST'],
      matcher: '/auth/customer/emailpass/reset-password',
      middlewares: [
        limitPerIp('password_reset', AUTH_LIMITS.password_reset, 60),
        requireCaptcha('password_reset'),
      ],
    },
    {
      // One verification email per address every 2 minutes.
      method: ['POST'],
      matcher: '/auth/verification/request',
      middlewares: [limitPerIp('verification', AUTH_LIMITS.verification, 60), limitVerificationEmails],
    },
    {
      method: ['POST'],
      matcher: '/store/customers',
      middlewares: [validatePhoneFields],
    },
    {
      method: ['POST'],
      matcher: '/store/customers/me',
      middlewares: [validatePhoneFields],
    },
    {
      method: ['POST'],
      matcher: '/store/customers/me/addresses',
      middlewares: [validatePhoneFields],
    },
    {
      method: ['POST'],
      matcher: '/store/customers/me/addresses/:address_id',
      middlewares: [validatePhoneFields],
    },
  ],
})
