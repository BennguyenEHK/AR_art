import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's React Compiler — enabled by template
  reactCompiler: true,

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
