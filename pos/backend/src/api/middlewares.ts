import {
  configureStoreSearch,
  defineMiddlewares,
  validateAndTransformBody,
} from '@medusajs/framework/http'
import { PostAdminPosCashier } from './admin/pos/cashiers/validators'
import {
  PostAdminPosCashierUpdate,
  PostAdminPosRegister,
  PostAdminPosRegisterUpdate,
} from './admin/pos/validators'
import {
  PostPosCheckout,
  PostPosCustomer,
  PostPosShiftClose,
  PostPosShiftOpen,
} from './pos/validators'
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
import { posCors, requireCashier } from './pos-auth'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
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
      middlewares: [validatePhoneFields],
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
    {
      // POS app routes (TASKS P2-03): POS_CORS, then a signed-in, active
      // cashier on every /pos route (pos-auth.ts).
      matcher: '/pos*',
      middlewares: [posCors, requireCashier],
    },
    {
      // Cashier sign-up and sign-in: same per-IP limits and password rule as
      // customers; no CAPTCHA (shop tablets). Sign-up only becomes a cashier
      // with an admin's invitation (/pos/cashiers/accept).
      method: ['POST'],
      matcher: '/auth/cashier/emailpass/register',
      middlewares: [limitPerIp('cashier_signup', AUTH_LIMITS.signup, 60), requireStrongPassword],
    },
    {
      method: ['POST'],
      matcher: '/auth/cashier/emailpass',
      middlewares: [limitPerIp('cashier_login', AUTH_LIMITS.login, 60)],
    },
    {
      method: ['POST'],
      matcher: '/admin/pos/cashiers',
      middlewares: [validateAndTransformBody(PostAdminPosCashier)],
    },
    // POS setup and cashier routes (TASKS P2-06); /pos* auth runs first
    // (wildcard matchers before static ones).
    {
      method: ['POST'],
      matcher: '/admin/pos/cashiers/:id',
      middlewares: [validateAndTransformBody(PostAdminPosCashierUpdate)],
    },
    {
      method: ['POST'],
      matcher: '/admin/pos/registers',
      middlewares: [validateAndTransformBody(PostAdminPosRegister)],
    },
    {
      method: ['POST'],
      matcher: '/admin/pos/registers/:id',
      middlewares: [validateAndTransformBody(PostAdminPosRegisterUpdate)],
    },
    {
      method: ['POST'],
      matcher: '/pos/shifts/open',
      middlewares: [validateAndTransformBody(PostPosShiftOpen)],
    },
    {
      method: ['POST'],
      matcher: '/pos/shifts/close',
      middlewares: [validateAndTransformBody(PostPosShiftClose)],
    },
    {
      method: ['POST'],
      matcher: '/pos/checkout',
      middlewares: [validateAndTransformBody(PostPosCheckout)],
    },
    {
      method: ['POST'],
      matcher: '/pos/customers',
      middlewares: [validateAndTransformBody(PostPosCustomer)],
    },
  ],
})
