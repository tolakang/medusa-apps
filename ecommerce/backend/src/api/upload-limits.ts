import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

// Limits for admin file uploads (TASKS P1-11). Medusa 2.21.1 sets none: its
// POST /admin/uploads route parses files with multer without `limits`
// (@medusajs/medusa api/admin/uploads/middlewares.js), and its docs recommend no
// image size. Registered in src/api/middlewares.ts; project middlewares on the
// same route run after Medusa's multer, so `req.files` is already parsed and
// nothing has been stored yet.

// Default 2 MB (owner's choice, 2026-09-28): a 2000 px JPEG/WebP product photo
// is usually 0.3–2 MB; raw camera files (10–30 MB) are rejected.
export const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 2

// SVG can carry scripts, which run on the file host (the RustFS domain that
// also serves its console) when an SVG is opened directly.
const BLOCKED_TYPES = ["image/svg+xml"]
const BLOCKED_EXTENSIONS = [".svg", ".svgz"]

type UploadedFile = { originalname: string; mimetype: string; size: number }

export function maxUploadBytes(env: string | undefined = process.env.UPLOAD_MAX_FILE_SIZE_MB) {
  const mb = Number(env)
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_UPLOAD_MAX_FILE_SIZE_MB) * 1024 * 1024
}

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
    return `"${file.originalname}" is ${sizeMb} MB; the limit is ${limitMb} MB. Resize it (about 2000 px on the longest side) and try again.`
  }
  return null
}

export function enforceUploadLimits(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const files = ((req as unknown as { files?: UploadedFile[] }).files ?? []) as UploadedFile[]
  const maxBytes = maxUploadBytes()
  const problems = files
    .map((file) => uploadProblem(file, maxBytes))
    .filter((problem): problem is string => problem !== null)
  if (problems.length) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, problems.join(" ")))
  }
  next()
}
