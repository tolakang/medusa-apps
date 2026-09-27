import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

// Env-driven config (BUILD_PLAN.md §4.1). Option shapes: MEDUSA_SKILL.md §2.
// REDIS_URL unset = in-memory infrastructure (development only).
// S3_BUCKET unset = local file storage (development only).
// RESEND_API_KEY / TELEGRAM_BOT_TOKEN unset = that channel only logs (TASKS P1-04).
const REDIS_URL = process.env.REDIS_URL
const S3_BUCKET = process.env.S3_BUCKET
const RESEND_API_KEY = process.env.RESEND_API_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

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

// Notification Module (TASKS D2, P1-04). Every channel the workflows use needs a
// provider, or createNotifications fails ("Could not find a notification
// provider for channel"), so an unconfigured channel falls back to
// notification-local, which only logs. "feed" keeps Medusa's default provider
// (docs: learn/configurations/medusa-config, Notification Module example).
const localProvider = (id: string, channel: string) => ({
  resolve: "@medusajs/medusa/notification-local",
  id,
  options: { name: `Local ${channel}`, channels: [channel] },
})

const notificationModule = {
  resolve: "@medusajs/medusa/notification",
  options: {
    providers: [
      localProvider("local", "feed"),
      RESEND_API_KEY
        ? {
            resolve: "./src/modules/resend",
            id: "resend",
            options: {
              channels: ["email"],
              api_key: RESEND_API_KEY,
              from: process.env.RESEND_FROM,
            },
          }
        : localProvider("local-email", "email"),
      TELEGRAM_BOT_TOKEN
        ? {
            resolve: "./src/modules/telegram",
            id: "telegram",
            options: {
              channels: ["telegram"],
              bot_token: TELEGRAM_BOT_TOKEN,
              chat_id: process.env.TELEGRAM_CHAT_ID,
            },
          }
        : localProvider("local-telegram", "telegram"),
    ],
  },
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    ...(databaseDriverOptions ? { databaseDriverOptions } : {}),
    redisUrl: REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE || "shared") as WorkerMode,
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
  },
  modules: [...redisModules, ...fileModules, notificationModule],
})
