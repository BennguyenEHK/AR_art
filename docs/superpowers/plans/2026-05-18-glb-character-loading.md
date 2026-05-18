# GLB Character Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AR character render from `character-mode-a.glb` / `character-mode-b.glb` instead of procedural Three.js geometry, preserving all JS-driven animation.

**Architecture:** The `character-animator` A-Frame component loads both GLBs with `THREE.GLTFLoader`, binds each part to an animation reference by GLB node name, captures rest poses so the idle animation is edit-safe, and keeps every existing `tick()` behaviour. The procedural `buildModeA`/`buildModeB` are deleted. The Mode A wound cracks are baked into the Blender source.

**Tech Stack:** A-Frame 1.6.0, AR.js 3.4.5, Three.js (bundled with A-Frame), `THREE.GLTFLoader`, Blender 4.x Python (`generate_character.py`).

**Verification approach:** This codebase has no automated test harness — the runtime needs a browser, camera and a physical Hiro marker, and `generate_character.py` needs Blender. So there are no red-green unit tests. Verification per task is: JavaScript syntax check (`node --check`), Python syntax check (`python -m py_compile`), lint, and a final manual device checklist (Task 4). This is a conscious decision, not an omission.

---

### Task 1: Rewrite the `character-animator` component to load GLBs

**Files:**
- Modify: `public/js/components.js` — replace the entire `AFRAME.registerComponent('character-animator', { ... })` block (currently lines ~318-787, the 4th component in the file). The `tornado-effect`, `barbed-wire` and `explosion-flash` components above it are NOT touched.

- [ ] **Step 1: Replace the `character-animator` component**

Find the line `AFRAME.registerComponent('character-animator', {` and its matching closing `});` (the last component before the file's final `})();`). Replace that whole block — including the `buildModeA` and `buildModeB` functions, which are deleted — with exactly this:

```js
  AFRAME.registerComponent('character-animator', {
    schema: {
      healingPercent: { type: 'number', default: 0 },
      mode:           { type: 'string', default: 'a' }
    },

    /* ------------------------------------------------------------------
     * init — create groups, kick off async GLB loading
     * ------------------------------------------------------------------ */
    init: function () {
      var THREE = AFRAME.THREE;
      this.THREE = THREE;

      this.groupA = new THREE.Group();
      this.groupB = new THREE.Group();
      this.groupB.visible = false;
      this.el.object3D.add(this.groupA);
      this.el.object3D.add(this.groupB);

      // Animation state
      this.transitioning       = false;
      this.transitionProgress  = 0;
      this.TRANSITION_DURATION = 1.5;

      this.waiting       = false;
      this.waitElapsed   = 0;
      this.WAIT_DURATION = 2.0;

      this.flyingUp     = false;
      this.flyElapsed   = 0;
      this.FLY_DURATION = 3.2;
      this.FLY_END_Y    = 2.8;

      this.modeBStarted = false;

      // GLB load state
      this.loaded                = false;
      this._loadCount            = 0;
      this.pendingHealingPercent = this.data.healingPercent;

      this.loadCharacterModels();
    },

    /* ------------------------------------------------------------------
     * loadCharacterModels — async-load both GLB files
     * ------------------------------------------------------------------ */
    loadCharacterModels: function () {
      var self  = this;
      var THREE = AFRAME.THREE;

      if (typeof THREE.GLTFLoader !== 'function') {
        console.error('[character-animator] THREE.GLTFLoader is unavailable');
        return;
      }
      var loader = new THREE.GLTFLoader();

      loader.load(
        'models/character-mode-a.glb',
        function (gltf) {
          self.groupA.add(gltf.scene);
          self.bindModeA(gltf.scene);
          self.onGlbLoaded();
        },
        undefined,
        function (err) {
          console.error('[character-animator] failed to load mode A GLB', err);
        }
      );

      loader.load(
        'models/character-mode-b.glb',
        function (gltf) {
          self.groupB.add(gltf.scene);
          self.bindModeB(gltf.scene);
          self.onGlbLoaded();
        },
        undefined,
        function (err) {
          console.error('[character-animator] failed to load mode B GLB', err);
        }
      );
    },

    /* ------------------------------------------------------------------
     * onGlbLoaded — fires once per GLB; ready when both are in
     * ------------------------------------------------------------------ */
    onGlbLoaded: function () {
      this._loadCount += 1;
      if (this._loadCount < 2) { return; }
      this.loaded = true;
      this.applyHealingVisuals(this.pendingHealingPercent);
      document.dispatchEvent(new CustomEvent('character-ready'));
    },

    /* ------------------------------------------------------------------
     * captureRest — store a mesh's load-time transform for relative anim
     * ------------------------------------------------------------------ */
    captureRest: function (mesh) {
      if (!mesh) { return; }
      mesh.userData.restPos   = mesh.position.clone();
      mesh.userData.restRot   = mesh.rotation.clone();
      mesh.userData.restScale = mesh.scale.clone();
    },

    /* ------------------------------------------------------------------
     * bindModeA — resolve Mode A parts from the loaded GLB by node name
     * ------------------------------------------------------------------ */
    bindModeA: function (scene) {
      this.headMesh  = scene.getObjectByName('head');
      this.torsoMesh = scene.getObjectByName('torso');

      // Clone the torso material so the healing colour lerp tints only the
      // torso, not the legs that share the `a_cloth` material in the GLB.
      if (this.torsoMesh && this.torsoMesh.material) {
        this.torsoMesh.material = this.torsoMesh.material.clone();
      }

      // Wound cracks are baked into the GLB once generate_character.py is
      // re-run in Blender; until then this node is simply absent.
      this.crackLines = scene.getObjectByName('wound_cracks') || null;
      this.crackMat   = this.crackLines ? this.crackLines.material : null;
      if (this.crackMat) {
        this.crackMat.transparent = true;   // required for the healing fade
      }

      this.captureRest(this.headMesh);
      this.captureRest(this.torsoMesh);
    },

    /* ------------------------------------------------------------------
     * bindModeB — resolve Mode B parts; tag wings; add the glow light
     * ------------------------------------------------------------------ */
    bindModeB: function (scene) {
      var THREE = AFRAME.THREE;

      var wingL = scene.getObjectByName('wing_l');
      var wingR = scene.getObjectByName('wing_r');
      if (wingL) {
        wingL.userData.isWing       = true;
        wingL.userData.wingBaseRotZ = wingL.rotation.z;
        wingL.userData.wingDir      = -1;
      }
      if (wingR) {
        wingR.userData.isWing       = true;
        wingR.userData.wingBaseRotZ = wingR.rotation.z;
        wingR.userData.wingDir      = 1;
      }

      // Glow light — not part of the GLB (a light, not geometry).
      var glow = new THREE.PointLight(0xfff5e6, 0.7, 2.5);
      glow.position.set(0, 1.2, 0);
      this.groupB.add(glow);
    },

    /* ------------------------------------------------------------------
     * update — react to schema changes
     * ------------------------------------------------------------------ */
    update: function (oldData) {
      if (
        oldData &&
        oldData.mode === 'a' &&
        this.data.mode === 'b' &&
        !this.modeBStarted
      ) {
        this.startModeTransition();
      }

      if (oldData && oldData.healingPercent !== this.data.healingPercent) {
        this.pendingHealingPercent = this.data.healingPercent;
        if (this.loaded) {
          this.applyHealingVisuals(this.data.healingPercent);
        }
      }
    },

    /* ------------------------------------------------------------------
     * applyHealingVisuals — lerp wounds away as healing advances
     * ------------------------------------------------------------------ */
    applyHealingVisuals: function (percent) {
      var THREE = AFRAME.THREE;
      var t = percent / 100;

      if (this.crackMat) {
        this.crackMat.opacity = 1 - t;
      }

      if (this.torsoMesh && this.torsoMesh.material) {
        var colorA = new THREE.Color(0x2a2218);
        var colorB = new THREE.Color(0x4a3c28);
        this.torsoMesh.material.color.copy(colorA).lerp(colorB, t);
      }
    },

    /* ------------------------------------------------------------------
     * startModeTransition — begin the A→B cross-fade
     * ------------------------------------------------------------------ */
    startModeTransition: function () {
      this.modeBStarted = true;
      this.groupB.visible = true;
      this.setGroupOpacity(this.groupB, 0);
      this.transitioning      = true;
      this.transitionProgress = 0;
    },

    /* ------------------------------------------------------------------
     * setGroupOpacity — set opacity on every Mesh in a group
     * ------------------------------------------------------------------ */
    setGroupOpacity: function (group, opacity) {
      group.traverse(function (child) {
        if (child.isMesh && child.material) {
          child.material.transparent = true;
          child.material.opacity     = opacity;
        }
      });
    },

    /* ------------------------------------------------------------------
     * tick — per-frame animation
     * ------------------------------------------------------------------ */
    tick: function (time, delta) {
      if (!this.loaded) { return; }
      var dt = delta / 1000;

      // Mode A idle breathing (before the transition begins)
      if (!this.modeBStarted && this.groupA.visible) {
        var breathe   = Math.sin(time * 0.00157) * 0.006;
        var sway      = Math.sin(time * 0.00094) * 0.004;
        var slumpRock = Math.sin(time * 0.00063) * 0.003;

        if (this.torsoMesh) {
          var trp = this.torsoMesh.userData.restPos;
          var trs = this.torsoMesh.userData.restScale;
          this.torsoMesh.position.y = trp.y + breathe;
          this.torsoMesh.scale.y    = trs.y * (1 + breathe * 0.8);
        }
        if (this.headMesh) {
          this.headMesh.position.y = this.headMesh.userData.restPos.y + breathe;
        }
        this.groupA.rotation.z = sway;
        this.groupA.rotation.x = slumpRock;

        if (this.crackMat) {
          var baseOpacity = 1 - (this.data.healingPercent / 100);
          this.crackMat.opacity = Math.max(0, baseOpacity + Math.sin(time * 0.0031) * 0.12);
        }
      }

      // Mode B idle: wing flap + gentle bob
      if (this.modeBStarted && this.groupB.visible) {
        var flapAngle = Math.sin(time * 0.00224) * 0.14;
        this.groupB.traverse(function (child) {
          if (child.userData.isWing) {
            child.rotation.z = child.userData.wingBaseRotZ
              + flapAngle * child.userData.wingDir;
          }
        });
        if (this.waiting) {
          this.groupB.position.y = Math.sin(time * 0.002) * 0.018;
        }
      }

      // Cross-fade A → B
      if (this.transitioning) {
        this.transitionProgress = Math.min(1, this.transitionProgress + dt / this.TRANSITION_DURATION);
        this.setGroupOpacity(this.groupA, 1 - this.transitionProgress);
        this.setGroupOpacity(this.groupB,     this.transitionProgress);

        if (this.transitionProgress >= 1) {
          this.transitioning  = false;
          this.groupA.visible = false;
          this.waiting        = true;
          this.waitElapsed    = 0;
        }
      }

      // Wait before flying up
      if (this.waiting) {
        this.waitElapsed += dt;
        if (this.waitElapsed >= this.WAIT_DURATION) {
          this.waiting    = false;
          this.flyingUp   = true;
          this.flyElapsed = 0;
        }
      }

      // Fly upward (ease-out quad)
      if (this.flyingUp) {
        this.flyElapsed = Math.min(this.FLY_DURATION, this.flyElapsed + dt);
        var t    = this.flyElapsed / this.FLY_DURATION;
        var ease = 1 - Math.pow(1 - t, 2);
        this.groupB.position.y = ease * this.FLY_END_Y;

        if (this.flyElapsed >= this.FLY_DURATION) {
          this.flyingUp = false;
          document.dispatchEvent(new CustomEvent('mode-b-complete'));
        }
      }
    },

    /* ------------------------------------------------------------------
     * remove — dispose loaded scenes
     * ------------------------------------------------------------------ */
    remove: function () {
      var self = this;
      var disposeGroup = function (group) {
        group.traverse(function (child) {
          if (child.isMesh) {
            if (child.geometry) { child.geometry.dispose(); }
            if (child.material) { child.material.dispose(); }
          }
        });
        if (self.el && self.el.object3D) {
          self.el.object3D.remove(group);
        }
      };
      if (this.groupA) { disposeGroup(this.groupA); }
      if (this.groupB) { disposeGroup(this.groupB); }
    }
  });
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check public/js/components.js`
Expected: no output, exit code 0 (a syntax error would print the line and fail).

- [ ] **Step 3: Lint the file**

Run: `npx eslint public/js/components.js`
Expected: no errors. (If eslint reports the file is ignored, that is acceptable — `node --check` in Step 2 is the binding gate.)

- [ ] **Step 4: Commit**

```bash
git add public/js/components.js
git commit -m "feat(ar): load character from GLB files instead of procedural geometry"
```

---

### Task 2: Make the loading overlay wait for the character

**Files:**
- Modify: `public/ar.html` — the inline `<script>` near the bottom, specifically the `scene.addEventListener('loaded', ...)` handler (currently ~lines 180-191).

- [ ] **Step 1: Replace the scene-loaded handler**

Find this block:

```js
      // Scene load handler
      scene.addEventListener('loaded', function () {
        // Fade out loading overlay
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.classList.add('hidden'), 900);
        setScanning();

        // Start healing sync after scene is ready
        // HealingSync.init() is deferred until Ably CDN has loaded (scene.loaded fires well after)
        if (window.HealingSync) {
          window.HealingSync.init().catch(console.error);
        }
      });
```

Replace it with:

```js
      // The loading overlay is cleared only once the character GLBs have
      // loaded (character-animator dispatches `character-ready`). A safety
      // timeout guarantees the spinner never hangs if a GLB fails to load.
      let overlayCleared = false;
      function clearOverlay() {
        if (overlayCleared) { return; }
        overlayCleared = true;
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.classList.add('hidden'), 900);
      }
      document.addEventListener('character-ready', clearOverlay);
      setTimeout(clearOverlay, 8000);

      // Scene load handler
      scene.addEventListener('loaded', function () {
        setScanning();

        // Start healing sync after scene is ready
        // HealingSync.init() is deferred until Ably CDN has loaded (scene.loaded fires well after)
        if (window.HealingSync) {
          window.HealingSync.init().catch(console.error);
        }
      });
```

- [ ] **Step 2: Visually verify the edit**

Run: `git diff public/ar.html`
Expected: only the block above changed — `clearOverlay`/`character-ready`/safety-timeout added, the overlay fade moved out of the `loaded` handler, `setScanning()` and `HealingSync.init()` still called on `loaded`.

- [ ] **Step 3: Commit**

```bash
git add public/ar.html
git commit -m "feat(ar): hold loading overlay until the character GLBs are ready"
```

---

### Task 3: Bake the wound cracks into the Blender source

**Files:**
- Modify: `public/blender/generate_character.py` — add a helper function and call it inside `build_mode_a()`.

- [ ] **Step 1: Add the `add_wound_cracks` helper**

Insert this function immediately AFTER the `add_wing_mesh` function definition and BEFORE the `parent_to_empty` function definition:

```python
def add_wound_cracks(material):
    """
    Build the Mode A face wound cracks as one mesh of thin quad ribbons.
    Endpoints mirror the procedural crack segments, converted from the
    Three.js Y-up (x, y_up, z) frame to Blender Z-up (x, y_depth, z_up).
    FRONT_OFFSET nudges the ribbons toward the face front so the low-poly
    head facets do not occlude them; tune in Blender if needed.
    """
    # (start_xyz, end_xyz) in Blender Z-up coordinates
    segments = [
        ((0.02, 0.14, 0.76), (0.09, 0.14, 0.71)),
        ((0.09, 0.14, 0.71), (0.12, 0.12, 0.67)),
        ((0.05, 0.14, 0.73), (0.02, 0.13, 0.68)),
        ((0.02, 0.14, 0.69), (-0.03, 0.12, 0.65)),
    ]
    WIDTH = 0.006
    FRONT_OFFSET = 0.04

    mesh = bpy.data.meshes.new('wound_cracks_mesh')
    obj = bpy.data.objects.new('wound_cracks', mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    for (p0, p1) in segments:
        # Crack direction projected onto the X-Z face plane, and the
        # in-plane perpendicular used to give each segment ribbon width.
        dx = p1[0] - p0[0]
        dz = p1[2] - p0[2]
        length = math.hypot(dx, dz) or 1.0
        px = -dz / length
        pz = dx / length
        hw = WIDTH / 2.0
        y0 = p0[1] + FRONT_OFFSET
        y1 = p1[1] + FRONT_OFFSET
        v0 = bm.verts.new((p0[0] + px * hw, y0, p0[2] + pz * hw))
        v1 = bm.verts.new((p0[0] - px * hw, y0, p0[2] - pz * hw))
        v2 = bm.verts.new((p1[0] - px * hw, y1, p1[2] - pz * hw))
        v3 = bm.verts.new((p1[0] + px * hw, y1, p1[2] + pz * hw))
        bm.faces.new([v0, v1, v2, v3])
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    if material:
        assign_material(obj, material)
    return obj
```

- [ ] **Step 2: Call it inside `build_mode_a()`**

In `build_mode_a()`, find the gun-barrel block ending with `parts.append(gun_barrel)`, and the line `# Parent everything to an empty`. Insert this BETWEEN them (after `parts.append(gun_barrel)`, before the `# Parent everything to an empty` comment):

```python
    # --- Wound cracks (face) ---
    wound_mat = make_material('a_wound', '#8B2020', roughness=0.8)
    wound_cracks = add_wound_cracks(wound_mat)
    parts.append(wound_cracks)
```

- [ ] **Step 3: Syntax-check the script**

Run: `python -m py_compile public/blender/generate_character.py`
Expected: no output, exit code 0. (This checks Python syntax only; it does not import `bpy`, so it is safe to run outside Blender. If `python` is not on PATH, try `py -m py_compile ...`.)

- [ ] **Step 4: Commit**

```bash
git add public/blender/generate_character.py
git commit -m "feat(blender): bake Mode A wound cracks into the character model"
```

---

### Task 4: Verification

**Files:** none — verification only.

- [ ] **Step 1: Confirm `THREE.GLTFLoader` is available**

In a browser on the deployed/served `/ar.html`, open DevTools console and run:
`typeof AFRAME.THREE.GLTFLoader`
Expected: `"function"`.
If it is `"undefined"`: A-Frame 1.6 did not expose the loader — add `<script src="https://cdn.jsdelivr.net/gh/aframevr/aframe@1.6.0/dist/aframe-extras.min.js"></script>` is NOT the fix; instead add the standalone loader before `js/components.js` in `ar.html`:
`<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/loaders/GLTFLoader.js"></script>`
Then re-test. (Expected outcome: this fallback is NOT needed — A-Frame 1.6 bundles GLTFLoader for its `gltf-model` component.)

- [ ] **Step 2: Repo health check**

Run: `npm run build`
Expected: build succeeds. (Next.js does not compile `public/`, so this only confirms the surrounding app is intact.)

- [ ] **Step 3: Manual device checklist**

Serve the app and open `/ar.html` on a phone with the Hiro marker. Confirm:
- The "preparing the witness" overlay clears only after the character appears (not before).
- The character renders on the marker at the correct size and upright orientation.
- Mode A idle breathing and sway are visible; no console errors.
- As healing progresses: the torso colour lightens and the tornado/wire/flash effects fade.
- At 100% healing: the A→B cross-fade plays, the angel's wings flap, the halo and glow show, the figure waits then flies up, and the end message appears.
- Regression: marker tracking steadiness, camera feed, environmental effects and HUD all behave as before.

- [ ] **Step 4: (after the user next runs Blender) Verify the wound cracks**

Once the user re-runs `generate_character.py` in Blender and the regenerated `character-mode-a.glb` is committed: confirm the dark-red face cracks appear on Mode A and fade out as healing progresses. Until then, cracks are correctly absent (the `wound_cracks` node does not exist yet).

---

## Self-Review

**Spec coverage:**
- Load both GLBs at runtime → Task 1 (`loadCharacterModels`). ✓
- Preserve all animation → Task 1 (`tick`, `update`, `applyHealingVisuals`, `startModeTransition` retained). ✓
- Robust to Blender edits → Task 1 (`captureRest` + rest-relative writes in `tick`). ✓
- Bake wound cracks into Blender source → Task 3. ✓
- Mesh binding by node name → Task 1 (`bindModeA`/`bindModeB`). ✓
- Material transparency / torso clone → Task 1 (`bindModeA` clones torso material, sets `crackMat.transparent`; `setGroupOpacity` handles cross-fade transparency). ✓
- Mode B glow light in JS → Task 1 (`bindModeB`). ✓
- Loading overlay waits for character → Task 2. ✓
- Graceful degradation (missing node) → Task 1 (`|| null` guards, `if` guards). ✓
- Delete `buildModeA`/`buildModeB`, update `remove()` → Task 1. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete.

**Type consistency:** `groupA`/`groupB`, `headMesh`/`torsoMesh`, `crackMat`/`crackLines`, `loaded`, `_loadCount`, `pendingHealingPercent`, `captureRest`, `bindModeA`/`bindModeB`, `onGlbLoaded`, `loadCharacterModels` — all defined in Task 1 and used consistently. The `character-ready` event is dispatched in Task 1 and listened for in Task 2. The `wound_cracks` node name is produced in Task 3 and consumed in Task 1.

**Spec refinement noted:** the spec said "set `transparent: true` on all materials at load." In implementation this is unnecessary for the cross-fade — `setGroupOpacity` already sets `transparent` during the transition, and Mode A is correctly opaque until then. Only `crackMat` needs `transparent` set early (its fade runs during Mode A), which `bindModeA` does. Same end result, less material churn.
