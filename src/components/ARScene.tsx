"use client";

// AR scene host. This file is loaded lazily (next/dynamic, ssr:false) from
// /ar/page.tsx, so all the WebGL / MindAR / camera bring-up only happens in
// the browser. Keep heavy logic here so the rest of the app stays light.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";
import {
  initialSceneState,
  publishSceneState,
  sharingEnabled,
  subscribeSceneState,
  type SceneState,
} from "@/lib/sceneState";

type Status = "idle" | "starting" | "scanning" | "tracking" | "error";

const TARGET_PATH = "/targets/board.mind";
// Change this to point at any .glb you drop into /public/models/.
// If the file is missing, ARScene falls back to a glowing placeholder shape.
const MODEL_PATH = "/models/Tree.glb";

export default function ARScene() {
  // The container <div> MindAR mounts the camera <video> + <canvas> into
  const containerRef = useRef<HTMLDivElement>(null);
  // Holds a teardown function so React's strict-mode re-mount can stop AR cleanly
  const cleanupRef = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usedFallbackModel, setUsedFallbackModel] = useState(false);
  const [scene, setScene] = useState<SceneState>(initialSceneState);

  useEffect(() => {
    let mounted = true;
    let started = false;

    async function start() {
      if (!containerRef.current || started) return;
      started = true;
      setStatus("starting");

      try {
        // Pin the container to the exact visual-viewport size before MindAR
        // reads clientWidth/Height in its internal resize(). On Android Chrome,
        // fixed-position layout may not be flushed when the loadedmetadata
        // callback fires, so CSS alone gives a stale value. window.innerWidth
        // is always authoritative.
        const container = containerRef.current!;
        const syncSize = () => {
          container.style.width  = window.innerWidth  + 'px';
          container.style.height = window.innerHeight + 'px';
        };
        syncSize();
        window.addEventListener('resize', syncSize);

        // Spin up MindAR — this is the bridge between camera + Three.js
        const mindar = new MindARThree({
          container,
          imageTargetSrc: TARGET_PATH,
          uiScanning: "no", // we draw our own minimal HUD
          uiLoading: "no",
        });
        const { renderer, scene: threeScene, camera } = mindar;

        // Calm, even lighting — peace-themed statue should not be dramatic
        threeScene.add(new THREE.AmbientLight(0xffffff, 1.15));
        const sun = new THREE.DirectionalLight(0xfff2d6, 0.85);
        sun.position.set(1.2, 2.4, 1.0);
        threeScene.add(sun);

        // Anchor #0 corresponds to the first image target inside the .mind file
        const anchor = mindar.addAnchor(0);

        // Try to load the real GLB; fall back to a minimal placeholder so the
        // app is always demonstrable even before the user supplies a model.
        let placed: THREE.Object3D;
        try {
          const loader = new GLTFLoader();
          const gltf = await loader.loadAsync(MODEL_PATH);
          placed = gltf.scene;
          placed.scale.setScalar(0.5); // reasonable default for a board-sized print
          placed.position.y = 0.0;
          placed.rotation.x = +Math.PI / 2;
        } catch {
          // Soft-glowing icosahedron — recognizable as "placeholder" without being ugly
          if (mounted) setUsedFallbackModel(true);
          const geo = new THREE.IcosahedronGeometry(0.32, 0);
          const mat = new THREE.MeshStandardMaterial({
            color: 0xfaf6ee,
            emissive: 0xc8a86b,
            emissiveIntensity: 0.35,
            roughness: 0.45,
            metalness: 0.15,
          });
          placed = new THREE.Mesh(geo, mat);
          placed.position.y = 0.32;
        }
        anchor.group.add(placed);

        // Driver-side rotation state. When sharing is enabled we publish/listen.
        let yaw = 0;
        const PUBLISH_INTERVAL_MS = 250; // 4 Hz is plenty for a slow rotation
        let lastPublish = 0;

        // If realtime is on, subscribe to remote yaw and apply locally so all
        // viewers tween toward the same rotation.
        const unsubscribe = subscribeSceneState((s) => {
          if (!mounted) return;
          setScene(s);
          yaw = s.worldYaw;
        });

        anchor.onTargetFound = () => mounted && setStatus("tracking");
        anchor.onTargetLost = () => mounted && setStatus("scanning");

        await mindar.start();
        if (!mounted) {
          mindar.stop();
          return;
        }
        // Belt-and-suspenders: after start() resolves, force MindAR to re-read
        // the now-settled container dimensions via its own resize listener.
        window.dispatchEvent(new Event('resize'));
        setStatus("scanning");

        // Render loop: rotate, render, optionally publish.
        renderer.setAnimationLoop(() => {
          placed.rotation.y = yaw;
          renderer.render(threeScene, camera);

          if (sharingEnabled()) {
            const now = performance.now();
            if (now - lastPublish > PUBLISH_INTERVAL_MS) {
              lastPublish = now;
              publishSceneState({
                presenceCount: 1,
                worldYaw: yaw,
                updatedAt: Date.now(),
              });
            }
          }
        });

        cleanupRef.current = () => {
          renderer.setAnimationLoop(null);
          unsubscribe();
          mindar.stop();
          renderer.dispose();
          window.removeEventListener('resize', syncSize);
        };
      } catch (e: unknown) {
        if (!mounted) return;
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to start AR. Check camera permissions and HTTPS.";
        setStatus("error");
        setErrorMsg(msg);
      }
    }

    void start();
    return () => {
      mounted = false;
      cleanupRef.current?.();
    };
  }, []);

  // Map status enum → human label/glyph for the HUD pill
  const statusLabel = (() => {
    switch (status) {
      case "tracking":
        return { dot: "●", text: "locked" };
      case "scanning":
        return { dot: "○", text: "scanning" };
      case "starting":
        return { dot: "↻", text: "starting" };
      case "error":
        return { dot: "×", text: "error" };
      default:
        return { dot: "—", text: "idle" };
    }
  })();

  return (
    <div className="fixed inset-0 bg-black">
      {/* MindAR mounts the camera <video> + WebGL <canvas> into here */}
      <div ref={containerRef} className="fixed inset-0 overflow-hidden isolate" />

      {/* Top HUD — status pill + presence */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-5 pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/90 shadow-[0_4px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <span className="font-mono">
            <span className="mr-2 inline-block w-3 text-amber-200">
              {statusLabel.dot}
            </span>
            {statusLabel.text}
          </span>
          <span className="font-mono opacity-70">
            {sharingEnabled()
              ? `${scene.presenceCount} viewer${scene.presenceCount === 1 ? "" : "s"}`
              : "solo (sharing off)"}
          </span>
        </div>
      </div>

      {/* Bottom hint — only show until the marker is locked */}
      {status !== "tracking" && status !== "error" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-[max(env(safe-area-inset-bottom),1.25rem)]">
          <p className="rounded-full bg-black/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/70 backdrop-blur-md">
            point camera at the printed board
          </p>
        </div>
      )}

      {/* Fallback model notice */}
      {usedFallbackModel && status !== "error" && (
        <div className="pointer-events-none absolute right-4 top-20 z-10 max-w-[16rem] rounded-md border border-amber-200/30 bg-black/55 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90 backdrop-blur">
          using placeholder shape — drop a real{" "}
          <code className="font-mono">statue.glb</code> into{" "}
          <code className="font-mono">/public/models/</code>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && errorMsg && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-6">
          <div className="max-w-md rounded-2xl border border-white/10 bg-zinc-950/90 p-7 text-zinc-200 shadow-2xl backdrop-blur">
            <h3 className="mb-2 text-lg font-semibold tracking-tight text-rose-200">
              AR could not start
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-zinc-400">
              {errorMsg}
            </p>
            <ul className="mb-5 list-disc pl-5 text-[12px] leading-6 text-zinc-500">
              <li>Allow camera access when prompted.</li>
              <li>Page must be served over HTTPS (or localhost).</li>
              <li>
                Drop a marker file at{" "}
                <code className="text-zinc-300">/public/targets/board.mind</code>{" "}
                — see <code className="text-zinc-300">instructions.md</code>.
              </li>
            </ul>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-amber-200 hover:text-amber-100"
            >
              ← back home
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
