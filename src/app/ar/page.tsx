"use client";

import { useEffect } from "react";

export default function ARPage() {
  useEffect(() => {
    window.location.replace("/ar-rag.html");
  }, []);

  // Black screen while the redirect fires — matches AR.js page background
  return <div style={{ background: "#000", height: "100dvh" }} />;
}
