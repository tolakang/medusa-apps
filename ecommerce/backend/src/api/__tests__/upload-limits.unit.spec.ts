import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { enforceUploadLimits, uploadProblem } from "../upload-limits"
import { currentUploadLimitMb, resolveUploadLimit } from "../../lib/upload-limit-setting"

jest.mock("../../lib/upload-limit-setting", () => ({
  ...jest.requireActual("../../lib/upload-limit-setting"),
  currentUploadLimitMb: jest.fn(),
}))

const MB = 1024 * 1024
const file = (originalname: string, mimetype: string, size: number) => ({
  originalname,
  mimetype,
  size,
})
const run = async (files: ReturnType<typeof file>[]) => {
  const next = jest.fn()
  await enforceUploadLimits(
    { files, scope: {} } as unknown as MedusaRequest,
    {} as MedusaResponse,
    next as unknown as MedusaNextFunction
  )
  return next
}

describe("upload limit precedence (TASKS P1-11, P1-12)", () => {
  it("default 0.8 MB, environment overrides it, admin setting overrides both", () => {
    expect(resolveUploadLimit(undefined, {})).toEqual(
      expect.objectContaining({ limitMb: 0.8, defaultMb: 0.8, source: "default", ceilingMb: 20 })
    )
    expect(resolveUploadLimit(undefined, { limit: "5" })).toEqual(
      expect.objectContaining({ limitMb: 5, source: "environment", defaultMb: 5 })
    )
    expect(resolveUploadLimit(3, { limit: "5" })).toEqual(
      expect.objectContaining({ limitMb: 3, source: "admin", defaultMb: 5 })
    )
  })

  it("never goes above the ceiling", () => {
    expect(resolveUploadLimit(500, {}).limitMb).toEqual(20)
    expect(resolveUploadLimit(15, { ceiling: "10" }).limitMb).toEqual(10)
    expect(resolveUploadLimit(undefined, { limit: "50", ceiling: "10" }).limitMb).toEqual(10)
  })

  it("ignores invalid values", () => {
    expect(resolveUploadLimit("abc", { limit: "0" })).toEqual(
      expect.objectContaining({ limitMb: 0.8, source: "default" })
    )
    expect(resolveUploadLimit(-1, { ceiling: "x" }).ceilingMb).toEqual(20)
  })
})

describe("admin upload checks (TASKS P1-11)", () => {
  it("accepts a normal product photo", () => {
    expect(uploadProblem(file("tee.jpg", "image/jpeg", 0.6 * MB), 0.8 * MB)).toBeNull()
    expect(uploadProblem(file("tee.jpg", "image/jpeg", 0.9 * MB), 0.8 * MB)).toContain("the limit is 0.8 MB")
  })

  it("rejects a file over the limit with a helpful message", () => {
    expect(uploadProblem(file("raw.jpg", "image/jpeg", 12.3 * MB), 5 * MB)).toEqual(
      '"raw.jpg" is 12.3 MB; the limit is 5 MB. Resize it (about 1600 px on the longest side, JPEG quality ~80, or save as WebP) and try again.'
    )
  })

  it("rejects SVG by type or by file name", () => {
    expect(uploadProblem(file("logo.svg", "image/svg+xml", 1000), 5 * MB)).toContain("SVG files are not allowed")
    expect(uploadProblem(file("LOGO.SVG", "application/octet-stream", 1000), 5 * MB)).toContain("SVG files are not allowed")
    expect(uploadProblem(file("x.svgz", "image/png", 1000), 5 * MB)).toContain("SVG files are not allowed")
  })

  it("middleware uses the current setting and rejects a too-large file", async () => {
    jest.mocked(currentUploadLimitMb).mockResolvedValue(3)
    const next = await run([file("ok.jpg", "image/jpeg", MB), file("big.png", "image/png", 4 * MB)])
    expect(next.mock.calls[0][0].message).toContain('"big.png" is 4.0 MB; the limit is 3 MB')
  })

  it("middleware passes files within the current setting", async () => {
    jest.mocked(currentUploadLimitMb).mockResolvedValue(5)
    const next = await run([file("four.jpg", "image/jpeg", 4 * MB)])
    expect(next).toHaveBeenCalledWith()
  })
})
