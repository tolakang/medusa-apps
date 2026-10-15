// S3 file provider options built from env (TASKS P1-05). Real uploads were
// verified against RustFS and SeaweedFS; this guards the env → options mapping.
type FileProvider = { resolve: string; options: Record<string, unknown> }
// defineConfig returns `modules` keyed by module name, with a `file` module
// even without S3 (local files).
type Config = {
  modules: Record<string, { resolve: string; options?: { providers?: FileProvider[] } }>
}

const S3_ENV = {
  S3_BUCKET: "medusa-test",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "test-key",
  S3_SECRET_ACCESS_KEY: "test-secret",
  S3_FILE_URL: "http://localhost:9000/medusa-test",
  S3_ENDPOINT: "http://localhost:9000",
  S3_FORCE_PATH_STYLE: "true",
}

function s3Options(env: Record<string, string | undefined>) {
  const saved = { ...process.env }
  Object.assign(process.env, S3_ENV, env)
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
  }
  let config: Config | undefined
  jest.isolateModules(() => {
    config = require("../../medusa-config") as Config
  })
  process.env = saved
  const s3 = config!.modules.file?.options?.providers?.find(
    (p) => p.resolve === "@medusajs/medusa/file-s3"
  )
  return s3?.options
}

describe("medusa-config S3 file provider", () => {
  it("passes endpoint and path-style for S3-compatible servers (RustFS, SeaweedFS)", () => {
    const options = s3Options({ S3_ACL: undefined })
    expect(options).toEqual(
      expect.objectContaining({
        bucket: "medusa-test",
        endpoint: "http://localhost:9000",
        file_url: "http://localhost:9000/medusa-test",
        additional_client_config: { forcePathStyle: true },
      })
    )
    // Unset S3_ACL keeps @medusajs/file-s3's own per-file ACL.
    expect(options).not.toHaveProperty("acl")
  })

  it("S3_ACL=false sends no ACL header (AWS buckets with Object Ownership enforced)", () => {
    expect(s3Options({ S3_ACL: "false" })).toEqual(expect.objectContaining({ acl: false }))
  })

  it("S3_ACL with a canned ACL passes it through", () => {
    expect(s3Options({ S3_ACL: "public-read" })).toEqual(
      expect.objectContaining({ acl: "public-read" })
    )
  })

  it("no S3_BUCKET means no S3 provider (local files in development)", () => {
    expect(s3Options({ S3_BUCKET: undefined })).toBeUndefined()
  })
})

// The admin's in-browser size check must equal the upload ceiling (TASKS F-027).
describe("medusa-config admin upload size", () => {
  const adminMaxBytes = (ceiling: string | undefined) => {
    const saved = { ...process.env }
    if (ceiling === undefined) delete process.env.UPLOAD_MAX_FILE_SIZE_CEILING_MB
    else process.env.UPLOAD_MAX_FILE_SIZE_CEILING_MB = ceiling
    let config: { admin?: { maxUploadFileSize?: number } } | undefined
    jest.isolateModules(() => {
      config = require("../../medusa-config")
    })
    process.env = saved
    return config!.admin?.maxUploadFileSize
  }

  it("defaults to the default upload ceiling", () => {
    const { DEFAULT_UPLOAD_MAX_FILE_SIZE_CEILING_MB } = require("../lib/upload-limit-setting")
    expect(adminMaxBytes(undefined)).toEqual(DEFAULT_UPLOAD_MAX_FILE_SIZE_CEILING_MB * 1024 * 1024)
  })

  it("follows UPLOAD_MAX_FILE_SIZE_CEILING_MB", () => {
    expect(adminMaxBytes("8")).toEqual(8 * 1024 * 1024)
  })
})
