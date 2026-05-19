"use client";

import { useEffect } from "react";

// AR is served as a standalone 8th Wall page (public/ar.html).
// This shell redirects immediately so Next.js routing still works.
export default function ARPage() {
  useEffect(() => {
    window.location.replace("/ar.html");
  }, []);

  // Black screen while the redirect fires — matches AR.js page background
  return <div style={{ background: "#000", height: "100dvh" }} />;
}
