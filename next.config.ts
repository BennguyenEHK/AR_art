import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's React Compiler — enabled by template
  reactCompiler: true,

  // mind-ar ships ESM that imports three internally; transpile so Next can bundle it
  transpilePackages: ["mind-ar"],

  // mind-ar's prod bundle has a Node-only branch (require("fs") behind an IS_NODE
  // runtime check). For browser builds we shim fs to an empty module so the
  // bundler can resolve it; the runtime check guarantees the code never executes
  // in the browser.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },

  // Camera/AR is a hard requirement, so make sure the browser sees the permission policy
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Grant camera to this origin only; mic stays off (we don't use audio in v1)
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
          // Basic clickjacking guard
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Slightly stricter referrer
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
