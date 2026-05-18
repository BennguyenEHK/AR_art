import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's React Compiler — enabled by template
  reactCompiler: true,

  // Camera/AR is a hard requirement, so make sure the browser sees the permission policy
  async headers() {
    // CSP for the AR page. ar-bootstrap.js loads the A-Frame build, 8th Wall
    // packages, and the engine binary from jsDelivr; Ably realtime + its CDN
    // back the multiplayer sync. cdn.8thwall.com is deliberately absent —
    // 8frame is self-hosted under /vendor/8thwall now that the CDN is dead.
    const arCsp = [
      "default-src 'self'",
      // 'wasm-unsafe-eval' + blob: are required by the 8th Wall engine — its
      // SLAM tracker is WebAssembly and it spawns blob-URL web workers.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.ably.com https://aframe.io",
      "connect-src 'self' blob: https://cdn.jsdelivr.net https://cdn.ably.com https://*.ably.io https://*.ably-realtime.com wss://*.ably.io wss://*.ably-realtime.com",
      "style-src 'self' 'unsafe-inline'",
      // jsDelivr serves the landing-page / xrextras splash images + fonts.
      "img-src 'self' data: blob: https://cdn.jsdelivr.net",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "font-src 'self' data: https://cdn.jsdelivr.net",
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
        source: "/ar.html",
        headers: [
          { key: "Content-Security-Policy", value: arCsp },
        ],
      },
    ];
  },
};

export default nextConfig;
