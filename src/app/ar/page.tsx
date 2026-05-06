"use client";

// next/dynamic with ssr:false is required because mind-ar/three rely on
// `window` and `navigator.mediaDevices`. This page is a thin client shell.

import dynamic from "next/dynamic";

const ARScene = dynamic(() => import("@/components/ARScene"), {
  ssr: false,
  // Loading state is also styled to match the dark AR backdrop so we don't flash cream
  loading: () => (
    <div className="ar-fullbleed grid h-[100dvh] place-items-center bg-black text-white/70">
      <div className="text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.32em] text-amber-200/80">
          opening lens
        </span>
        <span className="mt-3 block animate-pulse text-xs text-white/40">
          loading AR engine…
        </span>
      </div>
    </div>
  ),
});

export default function ARPage() {
  // The ar-fullbleed class is a hook for globals.css to repaint <body> black
  return (
    <div className="ar-fullbleed">
      <ARScene />
    </div>
  );
}
