import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  enforceUploadLimits,
  maxUploadBytes,
  uploadProblem,
} from "../upload-limits"

const MB = 1024 * 1024
const file = (originalname: string, mimetype: string, size: number) => ({
  originalname,
  mimetype,
  size,
})

describe("admin upload limits (TASKS P1-11)", () => {
  it("defaults to 2 MB and accepts UPLOAD_MAX_FILE_SIZE_MB", () => {
    expect(maxUploadBytes(undefined)).toEqual(2 * MB)
    expect(maxUploadBytes("5")).toEqual(5 * MB)
    expect(maxUploadBytes("not-a-number")).toEqual(2 * MB)
    expect(maxUploadBytes("0")).toEqual(2 * MB)
  })

  it("accepts a normal product photo", () => {
    expect(uploadProblem(file("tee.jpg", "image/jpeg", 1.5 * MB), 5 * MB)).toBeNull()
    expect(uploadProblem(file("tee.webp", "image/webp", 5 * MB), 5 * MB)).toBeNull()
  })

  it("rejects a file over the limit with a helpful message", () => {
    expect(uploadProblem(file("raw.jpg", "image/jpeg", 12.3 * MB), 5 * MB)).toEqual(
      '"raw.jpg" is 12.3 MB; the limit is 5 MB. Resize it (about 2000 px on the longest side) and try again.'
    )
  })

  it("rejects SVG by type or by file name", () => {
    expect(uploadProblem(file("logo.svg", "image/svg+xml", 1000), 5 * MB)).toContain("SVG files are not allowed")
    expect(uploadProblem(file("LOGO.SVG", "application/octet-stream", 1000), 5 * MB)).toContain("SVG files are not allowed")
    expect(uploadProblem(file("x.svgz", "image/png", 1000), 5 * MB)).toContain("SVG files are not allowed")
  })

  it("middleware passes an error to next() when any file breaks a rule", () => {
    const next = jest.fn()
    const req = { files: [file("ok.jpg", "image/jpeg", MB), file("big.png", "image/png", 9 * MB)] }
    enforceUploadLimits(
      req as unknown as MedusaRequest,
      {} as MedusaResponse,
      next as unknown as MedusaNextFunction
    )
    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0].message).toContain('"big.png" is 9.0 MB')
  })

  it("middleware calls next() without error when all files are fine", () => {
    const next = jest.fn()
    enforceUploadLimits(
      { files: [file("ok.jpg", "image/jpeg", MB)] } as unknown as MedusaRequest,
      {} as MedusaResponse,
      next as unknown as MedusaNextFunction
    )
    expect(next).toHaveBeenCalledWith()
  })
})
