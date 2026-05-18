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
        // AR page only — CSP letting the open-source 8th Wall engine load:
        // the engine binary + xrextras/landing-page come from jsDelivr, the
        // 8frame A-Frame build from 8th Wall's own CDN, and Ably realtime
        // from its CDN. The rest of the site stays CSP-free.
        source: "/ar.html",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "script-src 'self' cdn.jsdelivr.net cdn.8thwall.com https://cdn.ably.com 'unsafe-eval'",
              "connect-src 'self' cdn.jsdelivr.net cdn.8thwall.com *.ably.io wss://*.ably.io",
              "worker-src 'self' blob: cdn.jsdelivr.net cdn.8thwall.com",
              "img-src 'self' data: blob: cdn.jsdelivr.net cdn.8thwall.com",
              "media-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
