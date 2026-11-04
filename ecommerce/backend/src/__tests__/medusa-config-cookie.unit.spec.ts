// SESSION_COOKIE_SECURE → projectConfig.cookieOptions. Only "false" turns the
// admin session cookie's Secure flag off (local http stack); anything else
// keeps Medusa's default (Secure in production).
type Config = { projectConfig: { cookieOptions?: Record<string, unknown> } }

function cookieOptions(value: string | undefined) {
  const saved = { ...process.env }
  if (value === undefined) delete process.env.SESSION_COOKIE_SECURE
  else process.env.SESSION_COOKIE_SECURE = value
  let config: Config | undefined
  jest.isolateModules(() => {
    config = require("../../medusa-config") as Config
  })
  process.env = saved
  return config!.projectConfig.cookieOptions
}

describe("medusa-config session cookie", () => {
  it("turns Secure off only for SESSION_COOKIE_SECURE=false", () => {
    expect(cookieOptions("false")).toEqual({ secure: false })
  })

  it("keeps Medusa's default when unset or set to anything else", () => {
    expect(cookieOptions(undefined)).toBeUndefined()
    expect(cookieOptions("true")).toBeUndefined()
    expect(cookieOptions("")).toBeUndefined()
    expect(cookieOptions("FALSE")).toBeUndefined()
  })
})
