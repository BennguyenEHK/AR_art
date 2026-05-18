# GLB Character Loading — Design

- **Date:** 2026-05-18
- **Status:** Approved (Approach A)

## Problem / Context

The AR character is currently built **procedurally** in Three.js inside the
`character-animator` A-Frame component (`public/js/components.js`) — functions
`buildModeA` and `buildModeB`. The GLB files `public/models/character-mode-a.glb`
and `character-mode-b.glb` (produced by `public/blender/generate_character.py`)
exist but are **never loaded** — they are dead assets.

The user wants to edit the character model in Blender and have those edits
appear in the AR scene. That requires the runtime to **load the GLB files**
instead of building geometry in code, while preserving all animation behaviour.

## Goals

- Load `character-mode-a.glb` and `character-mode-b.glb` at runtime and render
  the loaded geometry.
- Preserve every existing animation: Mode A idle breathing + sway + wound-crack
  pulse; Mode A→B opacity cross-fade; Mode B wing flap, halo, glow, wait,
  fly-up; the healing-driven torso colour lerp and crack fade.
- Make the model robust to Blender edits — moving/reshaping parts must not break
  the animation.
- Bake the Mode A wound cracks into the Blender source so they become part of
  the GLB.

## Non-goals

- Moving animation into Blender (armatures / baked clips). The animation is an
  event-driven state machine (driven by healing % and Ably events) and stays
  JS-driven.
- Changing the marker, camera, environmental effects (tornado / barbed-wire /
  explosion), HUD, or the Ably sync logic.
- A procedural fallback. Per Approach A the GLBs are committed, same-origin
  static assets, so no fallback path is kept.

## Verified facts

- GLB node names are clean and stable:
  - A: `head, torso, arm_l, arm_r, upper_leg_l, upper_leg_r, lower_leg_l,
    lower_leg_r, gun_body, gun_barrel, character_a`
  - B: `head, torso, arm_l, arm_r, upper_leg_l, upper_leg_r, lower_leg_l,
    lower_leg_r, wing_l, wing_r, halo, character_b`
- Both GLBs contain **0 animation clips**.
- Neither GLB contains the Mode A wound cracks or the Mode B glow light.
- Mode A material `a_cloth` is shared by the torso and all four legs.
- GLB coordinates match the procedural build (head y≈0.68 in A, ≈1.38 in B,
  etc.) and the existing `character-root` position `0 -0.15 0`, so geometry
  drops in at the same place and scale with no offset change.

## Design

### Component interface (unchanged)

`character-animator` keeps its schema (`healingPercent`, `mode`) and its
external behaviour. `ar.html` is unaffected except for the loading overlay
(below). Only the component internals change.

### `init()`

1. Create empty `this.groupA`, `this.groupB`; add both to `el.object3D`;
   `groupB.visible = false`.
2. Start async load of both GLBs via `THREE.GLTFLoader`.
3. Initialise the existing animation-state variables.
4. Set `this.loaded = false`; `tick()` returns early until both GLBs are bound.
5. Store the latest `healingPercent` received before load, to apply on ready.

### Loader

- Use `THREE.GLTFLoader` (bundled with A-Frame 1.6 for its `gltf-model`
  component). Risk: verify the global is exposed; if not, load the loader
  script from CDN.
- Load `models/character-mode-a.glb` → `groupA`, `models/character-mode-b.glb`
  → `groupB`.
- When **both** resolve: bind meshes, capture rest poses, set
  `this.loaded = true`, apply any pending healing percent, dispatch a
  `character-ready` event.

### Mesh binding

For each loaded `gltf.scene`, resolve parts by node name via
`getObjectByName()`:

- `this.headMesh = …getObjectByName('head')`
- `this.torsoMesh = …getObjectByName('torso')`
- Mode B wings: `getObjectByName('wing_l' | 'wing_r')`, then set
  `userData.isWing = true`, `wingBaseRotZ` (±0.1), `wingDir` (left −1 /
  right +1) — matching the current procedural setup.
- Mode A cracks: `this.crackLines = …getObjectByName('wound_cracks')`;
  `this.crackMat = crackLines.material`. If absent, skip (graceful — see Error
  handling).
- For every animated mesh, capture rest transform into `userData`:
  `restPos`, `restRot`, `restScale` (clones).

### Animation rebinding (robustness fix)

The current `tick()` writes **absolute** values (e.g.
`torsoMesh.position.y = 0.38 + breathe`), which hardcodes the rest position and
would fight Blender edits. Change the affected writes to **rest-relative**:

- `torsoMesh.position.y = restPos.y + breathe`
- `headMesh.position.y  = restPos.y + breathe`
- `torsoMesh.scale.y    = restScale.y * (1 + breathe * 0.8)`

All other `tick()` logic is unchanged — group rotation sway, crack opacity
pulse, A→B cross-fade, wait, fly-up and wing flap already operate on groups,
materials, or relative rotations.

### Materials

- On load, traverse both scenes; set `material.transparent = true` on every
  mesh material so the cross-fade `opacity` works. (`setGroupOpacity` already
  traverses `isMesh`.)
- After binding Mode A, clone the torso material
  (`torsoMesh.material = torsoMesh.material.clone()`) so the healing colour
  lerp tints only the torso, not the legs that share `a_cloth`.

### Mode B glow light

After `groupB` binds, add `new THREE.PointLight(0xfff5e6, 0.7, 2.5)` at
`(0, 1.2, 0)` to `groupB` — identical to the current procedural code. It is a
light, not a mesh, so it is not pushed to `modeBMeshes`.

### Loading overlay (`ar.html`)

Today the overlay fades on the scene `loaded` event. Change it to also wait for
the character: clear the overlay when `character-ready` fires (it fires after
scene load, since loading begins in `init()`), with an ~8s safety timeout so
the page never hangs on the spinner if a GLB fails.

### Blender source change (`generate_character.py`)

Extend `build_mode_a()`:

- Add a `wound_cracks` object — thin sliver geometry approximating the four
  face crack segments at the existing procedural crack coordinates (in Blender
  Z-up). glTF line primitives export unreliably from Blender, so use thin
  elongated mesh geometry, not edges.
- Add material `a_wound` (dark red `#8B2020`).
- Name the object `wound_cracks` and parent it into `character_a`.

The committed `character-mode-a.glb` will not contain cracks until the user
re-runs the script in Blender; until then the runtime simply shows no cracks.

### `remove()`

Dispose both loaded scenes (geometries + materials) and remove the groups, as
the current `remove()` does for the procedural groups.

## Files touched

- `public/js/components.js` — rewrite the `character-animator` component:
  `init` (loader + binding), `tick` (rest-relative writes), `remove`. Delete
  `buildModeA` / `buildModeB`. The `tornado-effect`, `barbed-wire` and
  `explosion-flash` components are untouched.
- `public/blender/generate_character.py` — add the `wound_cracks` object to
  Mode A.
- `public/ar.html` — overlay waits for `character-ready` (+ safety timeout).

## Error handling

- GLB load failure: log to console; the overlay clears via the safety timeout.
  No procedural fallback (Approach A).
- Missing node (e.g. `wound_cracks` on an un-regenerated GLB): skip that
  feature; never throw.
- `tick()` guards on `this.loaded`.
- Healing-update events arriving before load: store the latest percent and
  apply it on `character-ready`.

## Testing

No automated AR test harness exists. Verification is manual + code-level:

- **Device:** model loads on the marker at correct scale/position; idle
  breathing and sway visible; healing progresses → torso lightens, effects
  fade, cracks fade (after the GLB is regenerated); at 100% the A→B cross-fade
  plays, wings flap, halo + glow show, fly-up runs, end message appears.
- **Code:** `THREE.GLTFLoader` resolves; all expected node names bind; no
  console errors; `tick()` no-ops cleanly before load.
- **Regression:** marker tracking, camera, environmental effects, HUD and Ably
  sync behave exactly as before.

## Risks

- `THREE.GLTFLoader` availability in A-Frame 1.6 — must be verified; CDN
  fallback if the global is not exposed.
- Async timing — addressed by buffering the pending healing percent and gating
  `tick()` on `this.loaded`.
- Material sharing in the GLB — addressed by cloning the torso material.
