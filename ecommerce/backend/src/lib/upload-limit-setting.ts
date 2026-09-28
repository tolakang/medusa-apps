import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Upload size limit that admins can change in Settings → Store (TASKS P1-12).
// Precedence: admin setting (store metadata) → UPLOAD_MAX_FILE_SIZE_MB → 2 MB,
// never above UPLOAD_MAX_FILE_SIZE_CEILING_MB (default 20), so an admin
// account cannot make the server accept huge uploads (multer holds the whole
// request in memory, TASKS P1-11).

export const UPLOAD_LIMIT_METADATA_KEY = "upload_max_file_size_mb"
export const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 2
export const DEFAULT_UPLOAD_MAX_FILE_SIZE_CEILING_MB = 20
// Other server instances pick up a change within this time.
const CACHE_MS = 60_000

export type UploadLimitSource = "admin" | "environment" | "default"

const positive = (value: unknown): number | null => {
  const n = Number(value)
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n) && n > 0
    ? n
    : null
}

export function ceilingMb(env = process.env.UPLOAD_MAX_FILE_SIZE_CEILING_MB) {
  return positive(env) ?? DEFAULT_UPLOAD_MAX_FILE_SIZE_CEILING_MB
}

export function resolveUploadLimit(
  adminValue: unknown,
  env: { limit?: string; ceiling?: string } = {
    limit: process.env.UPLOAD_MAX_FILE_SIZE_MB,
    ceiling: process.env.UPLOAD_MAX_FILE_SIZE_CEILING_MB,
  }
): { limitMb: number; source: UploadLimitSource; defaultMb: number; ceilingMb: number } {
  const ceiling = ceilingMb(env.ceiling)
  const envValue = positive(env.limit)
  const defaultMb = Math.min(envValue ?? DEFAULT_UPLOAD_MAX_FILE_SIZE_MB, ceiling)
  const admin = positive(adminValue)
  if (admin !== null) {
    return { limitMb: Math.min(admin, ceiling), source: "admin", defaultMb, ceilingMb: ceiling }
  }
  return {
    limitMb: defaultMb,
    source: envValue !== null ? "environment" : "default",
    defaultMb,
    ceilingMb: ceiling,
  }
}

export async function readStoreUploadSetting(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [store],
  } = await query.graph({ entity: "store", fields: ["id", "metadata"] })
  return { store, adminValue: store?.metadata?.[UPLOAD_LIMIT_METADATA_KEY] }
}

let cache: { limitMb: number; expires: number } | null = null

export function clearUploadLimitCache() {
  cache = null
}

export async function currentUploadLimitMb(container: MedusaContainer) {
  if (cache && cache.expires > Date.now()) {
    return cache.limitMb
  }
  const { adminValue } = await readStoreUploadSetting(container)
  const { limitMb } = resolveUploadLimit(adminValue)
  cache = { limitMb, expires: Date.now() + CACHE_MS }
  return limitMb
}
