import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

// Env-driven config (BUILD_PLAN.md §4.1, §6.4). Option shapes: MEDUSA_SKILL.md §2.
// Same infrastructure block as ecommerce/backend; the B2B modules come from
// medusajs/b2b-starter apps/backend (README: starter commit).
// REDIS_URL unset = in-memory infrastructure (development only).
// S3_BUCKET unset = local file storage (development only).
const REDIS_URL = process.env.REDIS_URL
const S3_BUCKET = process.env.S3_BUCKET

// Postgres SSL. Medusa turns SSL ON for any DATABASE_URL whose host is not
// localhost/127.0.0.1 (@medusajs/utils load-module-database-config.js,
// getDefaultDriverOptions). A Dokploy or docker-compose Postgres (host
// "<project>-postgres" / "postgres") has no SSL, so migrations hang.
//   DATABASE_SSL=false -> ssl off  (internal Postgres: Dokploy, compose)
//   DATABASE_SSL=true  -> ssl on, rejectUnauthorized: false (managed DB)
//   unset              -> Medusa's default by hostname
// Option shape: docs learn/configurations/medusa-config#databasedriveroptions
const DATABASE_SSL = process.env.DATABASE_SSL
const databaseDriverOptions =
  DATABASE_SSL === "false"
    ? { connection: { ssl: false } }
    : DATABASE_SSL === "true"
      ? { connection: { ssl: { rejectUnauthorized: false } } }
      : undefined

// Admin session cookie over plain http (local stack only). With
// NODE_ENV=production Medusa marks the session cookie Secure, so a browser on
// http://localhost never gets it and the admin can't stay signed in
// (@medusajs/framework express-loader resolveSessionCookieSecurity; it spreads
// projectConfig.cookieOptions over that default, @medusajs/types CookieOptions).
//   SESSION_COOKIE_SECURE=false -> cookie not Secure (docker-compose.local.yml)
//   unset or anything else      -> Medusa's default (Secure in production)
// Never set it on Dokploy: staging and production are served over HTTPS.
const cookieOptions =
  process.env.SESSION_COOKIE_SECURE === "false" ? { secure: false } : undefined

type WorkerMode = "shared" | "worker" | "server"

const redisModules = REDIS_URL
  ? [
      {
        resolve: "@medusajs/medusa/caching",
        options: {
          providers: [
            {
              resolve: "@medusajs/caching-redis",
              id: "caching-redis",
              is_default: true,
              options: { redisUrl: REDIS_URL },
            },
          ],
        },
      },
      {
        resolve: "@medusajs/medusa/event-bus-redis",
        options: { redisUrl: REDIS_URL },
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: { redis: { redisUrl: REDIS_URL } },
      },
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/locking-redis",
              id: "locking-redis",
              is_default: true,
              options: { redisUrl: REDIS_URL },
            },
          ],
        },
      },
    ]
  : []

// S3_ACL: empty = @medusajs/file-s3 default ("public-read" / "private" per
// file); "false" = send no ACL header, needed for AWS buckets with Object
// Ownership "Bucket owner enforced" (the AWS default for new buckets; file-s3
// resolveAcl comment), public read then comes from the bucket policy; any other
// value = that canned ACL. Tested with RustFS and SeaweedFS (TASKS P1-05).
const S3_ACL = process.env.S3_ACL
const s3Acl =
  S3_ACL === "false" ? false : S3_ACL || undefined

const fileModules = S3_BUCKET
  ? [
      {
        resolve: "@medusajs/medusa/file",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/file-s3",
              id: "s3",
              options: {
                file_url: process.env.S3_FILE_URL,
                access_key_id: process.env.S3_ACCESS_KEY_ID,
                secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                region: process.env.S3_REGION,
                bucket: S3_BUCKET,
                ...(s3Acl !== undefined ? { acl: s3Acl } : {}),
                endpoint: process.env.S3_ENDPOINT || undefined,
                additional_client_config: {
                  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
                },
              },
            },
          ],
        },
      },
    ]
  : []

// ABA PayWay (TASKS D1, P1-03; wholesale P4-12 for prepaid companies,
// copied from ecommerce/): registered as pp_payway_payway when the
// merchant ID and API key are set; the built-in manual provider
// (pp_system_default) is always there too (@medusajs/payment providers loader).
// Webhook: https://<api host>/hooks/payment/payway_payway.
const PAYWAY_MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID
const PAYWAY_API_KEY = process.env.PAYWAY_API_KEY
const paymentModules =
  PAYWAY_MERCHANT_ID && PAYWAY_API_KEY
    ? [
        {
          resolve: "@medusajs/medusa/payment",
          options: {
            providers: [
              {
                resolve: "./src/modules/payway",
                id: "payway",
                options: {
                  merchant_id: PAYWAY_MERCHANT_ID,
                  api_key: PAYWAY_API_KEY,
                  api_url: process.env.PAYWAY_API_URL || undefined,
                  return_url: process.env.PAYWAY_RETURN_URL,
                  storefront_url: process.env.STOREFRONT_URL,
                },
              },
            ],
          },
        },
      ]
    : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    ...(databaseDriverOptions ? { databaseDriverOptions } : {}),
    redisUrl: REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE || "shared") as WorkerMode,
    ...(cookieOptions ? { cookieOptions } : {}),
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL || undefined,
    // Links in account emails (password reset) point here.
    storefrontUrl: process.env.STOREFRONT_URL || undefined,
  },
  modules: [
    ...redisModules,
    ...fileModules,
    // B2B modules from the starter (plan §6.4: extend them, don't rebuild).
    { resolve: "./src/modules/company" },
    { resolve: "./src/modules/quote" },
    { resolve: "./src/modules/approval" },
    { resolve: "./src/modules/invoice" },
    ...paymentModules,
  ],
})
