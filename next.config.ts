import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // Keep browser tests separate from an editor's running development server.
  distDir:
    process.env.MEDIA_PIPELINE_TEST_BUILD === "true" ? ".next-test" : ".next",
  env: {
    // Analytics: Mark this project as created via create-cloudinary-next CLI
    CLOUDINARY_SOURCE: "cli",
  },
};

export default nextConfig;
