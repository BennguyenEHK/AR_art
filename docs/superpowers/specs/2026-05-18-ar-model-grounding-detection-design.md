# AR Model Grounding & Detection Fix — Design Spec
Date: 2026-05-18

## Problem

Two unresolved issues in the gun-violence AR installation:

1. **Floating + jitter (Issue 1):** The character model appears to hover above the Hiro marker rather than stand on it. Micro-animations compound AR tracking noise into visible jitter. Contrast: the AR.js dino demo is rock-solid and ground-planted.
2. **Detection dropout under variable lighting (Issue 2):** Despite prior fixes (`f9381cc`), the Hiro marker occasionally fails to lock — suspected contributor is poor lighting environment.

---

## Root Causes

### Issue 1 — Floating
| Symptom | Root Cause |
|---|---|
| Model feels airborne | `position Y=-0.15` estimated, not measured from GLB bounding box; tornado particles start at `y=0.2` (above marker plane) |
| No surface contact feel | No shadow/AO disc connecting feet to marker plane (dino has large claw footprint) |
| Jitter | `sway=sin*0.004 rad` + `slumpRock=sin*0.003 rad` applied every tick on top of tracking noise |

### Issue 2 — Detection
| Symptom | Root Cause |
|---|---|
| Detection fails in low/harsh light | AR.js pure grayscale pattern matching, no lighting adaptation |
| No user recovery path | Status pill shows "scanning" but gives no actionable guidance |

---

## Design: Approach B for both issues

### Issue 1 Fixes (files: `public/ar.html`, `public/js/components.js`)

1. **Y offset calibration:** Adjust `character-root` from `position="0 -0.15 0"` → `position="0 -0.18 0"` so feet sink slightly into the marker surface (matches the dino claw-on-surface effect).
2. **Shadow disc:** In `character-animator` init, add a `THREE.CircleGeometry` flat disc at `Y=0.001` (just above marker to avoid z-fighting), radius 0.22, dark semi-transparent material. Removed when mode B transition completes.
3. **Tornado grounding:** Lower particle floor: `var height = t * 1.6` → `var height = -0.05 + t * 1.65` so the tornado base starts at or below marker level.
4. **De-jitter:** Remove `this.groupA.rotation.z = sway` and `this.groupA.rotation.x = slumpRock` from `tick()`. Keep only the scale-based breathing on torso (no visible rotation noise).
5. **Smoother tracking:** Raise `<a-marker smoothCount="25"` → `smoothCount="40"`.
6. **Diagnostic log:** One-line bounding box log on GLB load for future calibration reference.

### Issue 2 Fixes (files: `public/ar.html`)

1. **Detection rate:** Add `maxDetectionRate: 60` to `arjs` attribute.
2. **Smart hint:** After `markerLost` fires and >3 s pass without `markerFound`, update hint pill text to "try better lighting or flatten marker" — revert to default on `markerFound`.
3. **Pattern ratio:** Add `patternRatio: 0.75` (default is 0.5 — higher = stricter but more reliable under partial occlusion).

---

## Execution

Two parallel worktree agents:
- **Agent A** — "AR Grounding Engineer": owns Issue 1 (both files above)
- **Agent B** — "AR Detection Engineer": owns Issue 2 (`ar.html` only)

Merge both branches after completion, then single `git commit && git push`.

---

## Success Criteria

- Model feet visually rest ON the marker surface (no floating gap)
- No visible jitter when camera is stationary
- Marker reliably locks under indoor office lighting and window backlight
- Smart hint appears when detection stalls >3 s
