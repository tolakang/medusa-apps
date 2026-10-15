import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { currentUploadLimitMb } from "../lib/upload-limit-setting"

// Limits for admin file uploads (TASKS P1-11). Medusa 2.21.1 sets none: its
// POST /admin/uploads route parses files with multer without `limits`
// (@medusajs/medusa api/admin/uploads/middlewares.js), and its docs recommend no
// image size. Registered in src/api/middlewares.ts; project middlewares on the
// same route run after Medusa's multer, so `req.files` is already parsed and
// nothing has been stored yet.

// The size limit comes from src/lib/upload-limit-setting.ts: the admin setting
// in Settings → Store (TASKS P1-12), else UPLOAD_MAX_FILE_SIZE_MB, else 0.8 MB
// (owner's choice), capped by UPLOAD_MAX_FILE_SIZE_CEILING_MB.

// SVG can carry scripts, which run on the file host (the RustFS domain that
// also serves its console) when an SVG is opened directly.
const BLOCKED_TYPES = ["image/svg+xml"]
const BLOCKED_EXTENSIONS = [".svg", ".svgz"]

type UploadedFile = { originalname: string; mimetype: string; size: number }

export function uploadProblem(file: UploadedFile, maxBytes: number): string | null {
  const name = file.originalname.toLowerCase()
  if (
    BLOCKED_TYPES.includes(file.mimetype.toLowerCase()) ||
    BLOCKED_EXTENSIONS.some((ext) => name.endsWith(ext))
  ) {
    return `"${file.originalname}": SVG files are not allowed. Upload JPEG, PNG or WebP.`
  }
  if (file.size > maxBytes) {
    const limitMb = maxBytes / 1024 / 1024
    const sizeMb = (file.size / 1024 / 1024).toFixed(1)
    return `"${file.originalname}" is ${sizeMb} MB; the limit is ${limitMb} MB. Resize it (about 1600 px on the longest side, JPEG quality ~80, or save as WebP) and try again.`
  }
  return null
}

export async function enforceUploadLimits(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const files = ((req as unknown as { files?: UploadedFile[] }).files ?? []) as UploadedFile[]
  if (!files.length) {
    return next()
  }
  let maxBytes: number
  try {
    maxBytes = (await currentUploadLimitMb(req.scope)) * 1024 * 1024
  } catch (e) {
    return next(e)
  }
  const problems = files
    .map((file) => uploadProblem(file, maxBytes))
    .filter((problem): problem is string => problem !== null)
  if (problems.length) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, problems.join(" ")))
  }
  next()
}
