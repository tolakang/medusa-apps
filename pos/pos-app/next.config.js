/**
 * POS counter app (TASKS P2-10). Web client standard (plan §4.2): standalone
 * output for the Docker runtime stage, traced from this folder only (F-010).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          // The camera is used only for barcode scanning, by this app.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        // The service worker must be revalidated, so updates reach the tablets.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ]
  },
}

module.exports = nextConfig
