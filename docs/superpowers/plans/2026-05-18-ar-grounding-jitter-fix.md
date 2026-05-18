# AR Model Grounding & Jitter Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AR character sit firmly on the Hiro marker (like the AR.js dino demo), eliminate micro-jitter, and add a shadow disc for visual grounding.

**Architecture:** Two files only — `public/ar.html` for scene-level tracking parameters, `public/js/components.js` for Three.js character animation. Shadow disc added to `character-animator` init; sway/slumpRock rotations removed from tick; Y offset and smoothCount tuned.

**Tech Stack:** A-Frame 1.6.0, AR.js 3.4.5, Three.js (bundled via A-Frame), vanilla JS.

---

## File Map

| File | Changes |
|---|---|
| `public/ar.html` | Line 84: `smoothCount` 25→40. Line 93: character-root Y -0.15→-0.18 |
| `public/js/components.js` | `character-animator` init: add shadow disc + bounding-box log. `tick()`: remove sway/slumpRock rotations. `remove()`: dispose shadow disc |

---

### Task 1: Tune tracking smoothness and Y offset in `ar.html`

**Files:**
- Modify: `public/ar.html` (lines 84 and 93)

**Context:** `smoothCount="25"` averages 25 pose frames. Raising to 40 costs ~13 ms of lag on a static scene but kills micro-jitter. The Y offset -0.15 was estimated; -0.18 makes the feet sink slightly into the marker plane just like the dino's claws.

- [ ] **Step 1: Edit smoothCount**

In `public/ar.html`, find line 84:
```html
<a-marker preset="hiro" id="hiro-marker" smooth="true" smoothCount="25" smoothTolerance="0.03" smoothThreshold="8">
```
Change to:
```html
<a-marker preset="hiro" id="hiro-marker" smooth="true" smoothCount="40" smoothTolerance="0.03" smoothThreshold="8">
```

- [ ] **Step 2: Edit character-root Y offset**

In `public/ar.html`, find lines 86-94:
```html
      <!-- Main character: position Y=-0.15 shifts character down so lower legs
           (originally at y=0.14) land at y=-0.01, effectively on the marker surface.
           Torso (originally y=0.38) becomes y=0.23 — a natural sitting height above marker. -->
      <a-entity
        id="character-root"
        character-animator="healingPercent: 0; mode: a"
        position="0 -0.15 0"
        rotation="0 0 0"
      ></a-entity>
```
Change to:
```html
      <!-- Main character: position Y=-0.18 shifts lower legs to y=-0.04, sinking
           feet slightly into the marker plane for a grounded feel (matches dino demo). -->
      <a-entity
        id="character-root"
        character-animator="healingPercent: 0; mode: a"
        position="0 -0.18 0"
        rotation="0 0 0"
      ></a-entity>
```

- [ ] **Step 3: Commit**

```bash
git add public/ar.html
git commit -m "fix(ar): raise smoothCount to 40 and sink character Y to -0.18 for grounded stance"
```

---

### Task 2: Remove sway/slumpRock rotations from `tick()` in `components.js`

**Files:**
- Modify: `public/js/components.js` (lines ~543–565, the Mode A idle block inside `tick`)

**Context:** `sway = sin * 0.004 rad` and `slumpRock = sin * 0.003 rad` applied to `groupA.rotation.z/x` every frame add organic motion ON TOP of AR.js tracking noise. The AR.js dino has zero tick-based rotations → zero compounded jitter. Only the scale-based torso breathing is retained (no rotation noise).

- [ ] **Step 1: Remove rotation assignments in tick()**

Find the Mode A idle breathing block in `tick()` (around line 544):
```javascript
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
```
Replace with:
```javascript
      // Mode A idle breathing (before the transition begins)
      // Rotation sway/slumpRock removed — they compound AR.js tracking noise into visible jitter.
      // Only scale-based torso breathing is kept; it produces no world-space rotation error.
      if (!this.modeBStarted && this.groupA.visible) {
        var breathe = Math.sin(time * 0.00157) * 0.006;

        if (this.torsoMesh) {
          var trp = this.torsoMesh.userData.restPos;
          var trs = this.torsoMesh.userData.restScale;
          this.torsoMesh.position.y = trp.y + breathe;
          this.torsoMesh.scale.y    = trs.y * (1 + breathe * 0.8);
        }
        if (this.headMesh) {
          this.headMesh.position.y = this.headMesh.userData.restPos.y + breathe;
        }

        if (this.crackMat) {
          var baseOpacity = 1 - (this.data.healingPercent / 100);
          this.crackMat.opacity = Math.max(0, baseOpacity + Math.sin(time * 0.0031) * 0.12);
        }
      }
```

- [ ] **Step 2: Commit**

```bash
git add public/js/components.js
git commit -m "fix(ar): remove sway/slumpRock tick rotations that compounded tracking jitter"
```

---

### Task 3: Add shadow disc and bounding-box log to `character-animator`

**Files:**
- Modify: `public/js/components.js` — `init()`, `loadCharacterModels()`, `remove()`

**Context:** The dino looks grounded because its large claw geometry overlaps the marker surface. We recreate this contact with a flat translucent circle at Y=0.001 (one millimetre above marker to avoid z-fighting). It's added to `this.el.object3D` so it's always at the marker origin regardless of groupA/B. Hidden when mode B flyingUp completes. The bounding-box log is a one-liner for future calibration.

- [ ] **Step 1: Add shadow disc in `init()`**

Find the end of `init()` in the `character-animator` component, just before `this.loadCharacterModels();`:
```javascript
      // GLB load state
      this.loaded                = false;
      this._loadCount            = 0;
      this.pendingHealingPercent = this.data.healingPercent;

      this.loadCharacterModels();
```
Replace with:
```javascript
      // GLB load state
      this.loaded                = false;
      this._loadCount            = 0;
      this.pendingHealingPercent = this.data.healingPercent;

      // Shadow disc — flat circle at Y=0.001 visually anchors character to marker surface
      var shadowGeo = new THREE.CircleGeometry(0.22, 32);
      var shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.30,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
      this.shadowDisc.rotation.x = -Math.PI / 2; // lay flat in XZ plane
      this.shadowDisc.position.y = 0.001;
      this.el.object3D.add(this.shadowDisc);

      this.loadCharacterModels();
```

- [ ] **Step 2: Add bounding-box log in Mode A GLB loader callback**

In `loadCharacterModels()`, find the mode A success callback:
```javascript
        function (gltf) {
          self.groupA.add(gltf.scene);
          self.bindModeA(gltf.scene);
          self.onGlbLoaded();
        },
```
Replace with:
```javascript
        function (gltf) {
          var box = new self.THREE.Box3().setFromObject(gltf.scene);
          var size = box.getSize(new self.THREE.Vector3());
          console.log('[character-animator] Mode A bounds — min.y:', box.min.y.toFixed(3), 'max.y:', box.max.y.toFixed(3), 'height:', size.y.toFixed(3));
          self.groupA.add(gltf.scene);
          self.bindModeA(gltf.scene);
          self.onGlbLoaded();
        },
```

- [ ] **Step 3: Hide shadow disc when Mode B fly-up completes**

In `tick()`, find the fly-up completion block:
```javascript
        if (this.flyElapsed >= this.FLY_DURATION) {
          this.flyingUp = false;
          document.dispatchEvent(new CustomEvent('mode-b-complete'));
        }
```
Replace with:
```javascript
        if (this.flyElapsed >= this.FLY_DURATION) {
          this.flyingUp = false;
          if (this.shadowDisc) { this.shadowDisc.visible = false; }
          document.dispatchEvent(new CustomEvent('mode-b-complete'));
        }
```

- [ ] **Step 4: Dispose shadow disc in `remove()`**

Find the start of `remove()`:
```javascript
    remove: function () {
      var self = this;
      var disposeGroup = function (group) {
```
Replace with:
```javascript
    remove: function () {
      var self = this;
      if (this.shadowDisc) {
        this.el.object3D.remove(this.shadowDisc);
        this.shadowDisc.geometry.dispose();
        this.shadowDisc.material.dispose();
        this.shadowDisc = null;
      }
      var disposeGroup = function (group) {
```

- [ ] **Step 5: Commit**

```bash
git add public/js/components.js
git commit -m "feat(ar): add shadow disc for visual grounding and GLB bounding-box diagnostic log"
```
