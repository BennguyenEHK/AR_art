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
      {
        // AR page only — CSP letting the open-source 8th Wall engine (jsDelivr CDN),
        // A-Frame, and Ably realtime load; rest of the site stays CSP-free
        source: "/ar.html",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "script-src 'self' cdn.jsdelivr.net https://aframe.io https://cdn.ably.com 'unsafe-eval'",
              "connect-src 'self' cdn.jsdelivr.net *.ably.io wss://*.ably.io",
              "worker-src 'self' blob:",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
