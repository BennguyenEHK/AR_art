"use client";

import { useEffect } from "react";

// Temporary: redirect to the raw RAG reference example for engine compatibility testing.
// Switch back to "/ar.html" once verified working on device.
export default function ARPage() {
  useEffect(() => {
    window.location.replace("/ar-rag.html");
  }, []);

  // Black screen while the redirect fires — matches AR.js page background
  return <div style={{ background: "#000", height: "100dvh" }} />;
}
