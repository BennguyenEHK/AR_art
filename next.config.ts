import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's React Compiler — enabled by template
  reactCompiler: true,

  // Camera/AR is a hard requirement, so make sure the browser sees the permission policy
  async headers() {
    // CSP for the AR page. ar-rag.html loads the 8th Wall packages + engine
    // binary from jsDelivr and Ably realtime from its CDN; 8frame is
    // self-hosted under /vendor/8thwall (the 8th Wall CDN is gone).
    const arCsp = [
      "default-src 'self'",
      // 'wasm-unsafe-eval' + blob: are required by the 8th Wall engine — its
      // SLAM tracker is WebAssembly and it spawns blob-URL web workers.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.ably.com",
      "connect-src 'self' blob: https://cdn.jsdelivr.net https://cdn.ably.com https://*.ably.io https://*.ably-realtime.com wss://*.ably.io wss://*.ably-realtime.com",
      // fonts.googleapis.com serves the @import CSS; fonts.gstatic.com serves woff2 files.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // jsDelivr serves xrextras/landing-page splash assets.
      "img-src 'self' data: blob: https://cdn.jsdelivr.net",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
    ].join("; ");

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
        // Scoped to the AR page only — the rest of the site has no need for
        // the cross-origin script/connect allowances the AR engines require.
        source: "/ar-rag.html",
        headers: [
          { key: "Content-Security-Policy", value: arCsp },
        ],
      },
    ];
  },
};

export default nextConfig;
