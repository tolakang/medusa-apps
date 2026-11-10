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
import { requireSeller, sellerCors } from './seller-auth'
import { PostAdminSeller, PostAdminSellerPayout } from './admin/sellers/validators'

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
      // Seller portal routes (TASKS P5-03): SELLER_CORS, then a signed-in
      // seller who isn't suspended on every /sellers route (seller-auth.ts).
      matcher: '/sellers*',
      middlewares: [sellerCors, requireSeller],
    },
    {
      // Seller sign-up and sign-in: the same per-IP limits and password rule
      // as customers; sign-up only becomes a seller with the shop's
      // invitation (/sellers/accept).
      method: ['POST'],
      matcher: '/auth/seller/emailpass/register',
      middlewares: [limitPerIp('seller_signup', AUTH_LIMITS.signup, 60), requireStrongPassword],
    },
    {
      method: ['POST'],
      matcher: '/auth/seller/emailpass',
      middlewares: [limitPerIp('seller_login', AUTH_LIMITS.login, 60)],
    },
    {
      method: ['POST'],
      matcher: '/auth/seller/emailpass/reset-password',
      middlewares: [limitPerIp('seller_password_reset', AUTH_LIMITS.password_reset, 60)],
    },
    {
      method: ['POST'],
      matcher: '/admin/sellers',
      middlewares: [validateAndTransformBody(PostAdminSeller)],
    },
    {
      method: ['POST'],
      matcher: '/admin/sellers/:id/payouts',
      middlewares: [validateAndTransformBody(PostAdminSellerPayout)],
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
