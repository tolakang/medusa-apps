const checkEnvVariables = require("./check-env-variables")

checkEnvVariables()

/**
 * Product image bucket (S3 / R2 / MinIO). Build-time args (BUILD_PLAN.md §4.2,
 * starter change 4; the starter read MEDUSA_CLOUD_S3_* instead).
 */
const S3_HOSTNAME = process.env.S3_IMAGE_HOSTNAME
const S3_PATHNAME = process.env.S3_IMAGE_PATHNAME

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Self-contained server for the Docker runtime stage (starter change 3).
  output: "standalone",
  // Trace from this app only, so .next/standalone/server.js sits at the
  // standalone root even if a parent folder holds another lockfile.
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      ...(S3_HOSTNAME && S3_PATHNAME
        ? [
            {
              protocol: "https",
              hostname: S3_HOSTNAME,
              pathname: S3_PATHNAME,
            },
          ]
        : []),
    ],
  },
}

module.exports = nextConfig
