import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { updateStoresWorkflow } from "@medusajs/medusa/core-flows"
import {
  clearUploadLimitCache,
  readStoreUploadSetting,
  resolveUploadLimit,
  UPLOAD_LIMIT_METADATA_KEY,
} from "../../../lib/upload-limit-setting"
import type { PostAdminUploadLimitType } from "./validators"

// GET/POST /admin/upload-limit (TASKS P1-12). /admin/* requires an admin user
// (MEDUSA_SKILL §7). The value lives in the store's metadata and is written
// through updateStoresWorkflow.

async function describe(req: MedusaRequest) {
  const { adminValue } = await readStoreUploadSetting(req.scope)
  const { limitMb, source, defaultMb, ceilingMb } = resolveUploadLimit(adminValue)
  return { limit_mb: limitMb, source, default_mb: defaultMb, ceiling_mb: ceilingMb }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ upload_limit: await describe(req) })
}

export const POST = async (
  req: MedusaRequest<PostAdminUploadLimitType>,
  res: MedusaResponse
) => {
  const { limit_mb } = req.validatedBody
  const { ceilingMb } = resolveUploadLimit(null)
  if (limit_mb !== null && limit_mb > ceilingMb) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The upload limit can be at most ${ceilingMb} MB (UPLOAD_MAX_FILE_SIZE_CEILING_MB).`
    )
  }

  const { store } = await readStoreUploadSetting(req.scope)
  if (!store) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No store found.")
  }
  // Keep other metadata; null removes the key (back to the environment default).
  const metadata: Record<string, unknown> = { ...(store.metadata ?? {}) }
  if (limit_mb === null) {
    delete metadata[UPLOAD_LIMIT_METADATA_KEY]
  } else {
    metadata[UPLOAD_LIMIT_METADATA_KEY] = limit_mb
  }
  await updateStoresWorkflow(req.scope).run({
    input: { selector: { id: store.id }, update: { metadata } },
  })
  clearUploadLimitCache()

  res.json({ upload_limit: await describe(req) })
}
