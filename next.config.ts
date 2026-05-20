import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's React Compiler — enabled by template
  reactCompiler: true,

  // Camera/AR is a hard requirement, so make sure the browser sees the permission policy
  async headers() {
    // CSP for the AR page. ar-rag.html loads the 8th Wall packages + engine
    // binary from jsDelivr and Ably realtime from its CDN; 8frame is
    // self-hosted under /vendor/8thwall (the 8th Wall CDN is gone).
    //
    // CRITICAL: the 8th Wall WebAR engine performs a license-validation
    // request to *.8thwall.com (typically apps.8thwall.com) at startup
    // — if connect-src does not allow that origin the WASM engine fails
    // silently, the @8thwall/landing-page "TAP TO ENTER AR" splash is
    // never injected, the user never produces a gesture, and the camera
    // is never requested. Until 379cd28 this CSP only applied to /ar.html
    // (now deleted); when scope moved to /ar-rag.html the missing
    // *.8thwall.com allowlist became the dominant cause of the
    // "no splash, no camera" symptom on both Android and iOS. *.8thwall.com
    // is also added to script-src/img-src/font-src/frame-src defensively
    // because landing-page historically loads logo/font/iframe assets
    // from sibling subdomains.
    const arCsp = [
      "default-src 'self'",
      // 'wasm-unsafe-eval' + blob: are required by the 8th Wall engine — its
      // SLAM tracker is WebAssembly and it spawns blob-URL web workers.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.ably.com https://*.8thwall.com",
      "connect-src 'self' blob: https://cdn.jsdelivr.net https://cdn.ably.com https://*.ably.io https://*.ably-realtime.com wss://*.ably.io wss://*.ably-realtime.com https://*.8thwall.com",
      // fonts.googleapis.com serves the @import CSS; fonts.gstatic.com serves woff2 files.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // jsDelivr serves xrextras/landing-page splash assets.
      "img-src 'self' data: blob: https://cdn.jsdelivr.net https://*.8thwall.com",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com https://*.8thwall.com",
      // landing-page historically renders the splash inside a same-origin
      // (or blob:) iframe. frame-src is not set elsewhere, so without this
      // line it falls back to default-src 'self' and the iframe still works,
      // BUT making the allowance explicit also enables blob: iframes used
      // by some 8th Wall flows.
      "frame-src 'self' blob: https://*.8thwall.com",
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
