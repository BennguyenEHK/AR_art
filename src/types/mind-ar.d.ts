// Minimal type shim for MindAR — the package ships JS only, no .d.ts.
// We declare just the surface area we actually use in ARScene.tsx.

declare module "mind-ar/dist/mindar-image-three.prod.js" {
  import type { Object3D, Scene, PerspectiveCamera, WebGLRenderer } from "three";

  export interface MindARThreeAnchor {
    group: Object3D;
    // MindAR fires these when the printed marker enters / leaves the camera frame
    onTargetFound?: () => void;
    onTargetLost?: () => void;
    onTargetUpdate?: () => void;
  }

  export interface MindARThreeOptions {
    container: HTMLElement;
    imageTargetSrc: string;
    maxTrack?: number;
    // Pass "no" to suppress MindAR's built-in scanning UI overlay
    uiScanning?: string | false;
    uiLoading?: string | false;
    uiError?: string | false;
    filterMinCF?: number;
    filterBeta?: number;
    warmupTolerance?: number;
    missTolerance?: number;
  }

  export class MindARThree {
    constructor(opts: MindARThreeOptions);
    renderer: WebGLRenderer;
    scene: Scene;
    camera: PerspectiveCamera;
    addAnchor(targetIndex: number): MindARThreeAnchor;
    start(): Promise<void>;
    stop(): void;
  }
}
