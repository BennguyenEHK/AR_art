import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's React Compiler — enabled by template
  reactCompiler: true,

  // Camera/AR is a hard requirement, so make sure the browser sees the permission policy
  async headers() {
    // Per-page Content-Security-Policy for /ar-rag.html has been REMOVED.
    //
    // Forensic finding (three-agent cross-investigation against commits
    // 0f46401 / 184d810 / 379cd28):
    //   · At 0f46401 (cactus) and 184d810 (character-mode-a), the CSP
    //     header rule's `source:` was `/ar.html`, so /ar-rag.html
    //     received NO Content-Security-Policy at all. In both states,
    //     the @8thwall/landing-page splash rendered correctly and the
    //     camera worked on iOS + Android.
    //   · Commit 379cd28 deleted /ar.html and re-pointed the rule to
    //     source: "/ar-rag.html". The CSP directives themselves were
    //     unchanged. From that point on, /ar-rag.html received the
    //     strict CSP for the first time — and the splash stopped
    //     rendering on both platforms.
    //   · Adding https://*.8thwall.com to script/connect/img/font/frame
    //     (commit 4e7ce6f) did NOT restore the splash. Without console
    //     access on a real device we cannot enumerate which directive
    //     is the residual blocker.
    //
    // Decision: restore the exact pre-379cd28 header configuration for
    // /ar-rag.html (no CSP on the AR page) until we can determine the
    // precise allowlist via a real-device CSP violation report. The
    // global Permissions-Policy / X-Frame-Options / Referrer-Policy
    // below still apply — those are not CSP and don't block 8th Wall.
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
