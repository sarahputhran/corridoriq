import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The demo reset reads the processed data files at run time, so they must ship with those routes.
  outputFileTracingIncludes: { "/api/admin/reset": ["./data/processed/**"], "/admin": ["./data/processed/**"] },
  // Permit documents travel with the submit form (three files of up to 4 MB each).
  experimental: { serverActions: { bodySizeLimit: "14mb" } },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
