(function() {
  'use strict';

  // ---------------------------------------------------------------------------
  // eighth-wall-placement
  //
  // Engine adapter for the open-source 8th Wall world-tracking SLAM stack.
  // Drop-in replacement for the old `webxr-placement` component. It owns the
  // ground-placement reticle, surface tracking, tap-to-place detection, and
  // emits the three DOM CustomEvents the HUD/multiplayer layer listens for.
  //
  // The boundary contract (events + autoPlace) is identical to the old
  // component so that zero other code needs to change.
  //
  // Events emitted on `document`:
  //   surface-detected  — no detail — ground tracking became stable
  //   surface-lost      — no detail — ground tracking was lost
  //   object-placed     — { x, y, z, autoPlaced } — witness placed
  //
  // Public methods:
  //   autoPlace()       — force placement at { 0, 0, -1.5 }, autoPlaced:true
  // ---------------------------------------------------------------------------

  AFRAME.registerComponent('eighth-wall-placement', {
    schema: {
      placed: { type: 'boolean', default: false }
    },

    init: function() {
      this.placed = false;          // witness has been placed; tracking frozen
      this.hasHit = false;          // current frame has a valid ground hit
      this._wasDetected = false;    // edge-detect flag for surface-detected/-lost
      this._ready = false;          // 8th Wall reported `realityready`
      this.reticleMesh = null;
      this.canvas = null;
      this._onTap = null;
      this._onReady = null;
      this._onTrackingLost = null;

      var THREE = AFRAME.THREE;

      // Inner ring reticle — geometry pre-rotated so it lies flat on the floor.
      // matrixAutoUpdate stays true here: unlike the old WebXR component we
      // position the mesh via the object3D, not by writing a raw pose matrix.
      var geometry = new THREE.RingGeometry(0.08, 0.12, 32).rotateX(-Math.PI / 2);
      var material = new THREE.MeshBasicMaterial({
        color: 0xd4a843,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });
      this.reticleMesh = new THREE.Mesh(geometry, material);
      this.reticleMesh.visible = false;
      this.el.object3D.add(this.reticleMesh);

      // Reusable scratch objects so tick() allocates nothing.
      this._ray = new THREE.Ray();
      // World plane y = 0 — 8th Wall world tracking anchors the origin to the
      // ground after `realityready`, so the floor is the mathematical y=0 plane.
      this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      this._hitPoint = new THREE.Vector3();
      this._screenCenter = new THREE.Vector2(0, 0);

      var self = this;

      // --- 8th Wall tracking lifecycle -----------------------------------
      // `realityready` fires on the scene when the SLAM engine has initialized
      // and the world origin is locked to the ground.
      this._onReady = function() { self._ready = true; };
      this.el.sceneEl.addEventListener('realityready', this._onReady);

      // Tracking-loss signals. 8th Wall surfaces these as `xrerror` and, in
      // some builds, a `xrtrackingstatus` event. We listen for both defensively;
      // whichever the engine emits will be handled, the other is simply unused.
      this._onTrackingLost = function(evt) {
        // `xrtrackingstatus` carries a status string; anything other than the
        // normal/limited "good" states is treated as a loss. `xrerror` is
        // always a loss. Guard around the unknown detail shape.
        var lost = true;
        try {
          if (evt && evt.detail && typeof evt.detail.status === 'string') {
            lost = (evt.detail.status !== 'NORMAL' && evt.detail.status !== 'normal');
          }
        } catch (e) { /* treat malformed detail as a loss */ }
        if (lost) { self._ready = false; }
      };
      this.el.sceneEl.addEventListener('xrerror', this._onTrackingLost);
      this.el.sceneEl.addEventListener('xrtrackingstatus', this._onTrackingLost);

      // --- placement tap --------------------------------------------------
      // 8th Wall renders the camera into a normal <canvas>, so DOM pointer
      // events fire (unlike immersive WebXR). The canvas may not exist until
      // the scene has loaded, so defer listener attachment until then.
      if (this.el.sceneEl.hasLoaded) {
        this._attachTapListeners();
      } else {
        this._onSceneLoaded = function() { self._attachTapListeners(); };
        this.el.sceneEl.addEventListener('loaded', this._onSceneLoaded);
      }
    },

    // Attach touchstart + click listeners to the scene canvas. Both are used:
    // touchstart for mobile (the real use case) and click as a desktop / mouse
    // fallback so the behaviour is testable outside AR.
    _attachTapListeners: function() {
      var canvas = this.el.sceneEl.canvas;
      if (!canvas) { return; }
      this.canvas = canvas;
      var self = this;
      this._onTap = function() { self._handleTap(); };
      canvas.addEventListener('touchstart', this._onTap);
      canvas.addEventListener('click', this._onTap);
    },

    _handleTap: function() {
      // Only place once, and only when we currently have a valid ground hit.
      if (this.placed || !this.hasHit) { return; }
      this._placeObject();
    },

    tick: function(time) {
      if (this.placed) { return; }

      // No engine / not initialized — emit nothing. ar.html drives the
      // unsupported-device UI; this component just stays quiet.
      if (!this._ready || !this._engineActive()) {
        this._loseSurface();
        return;
      }

      var hit = this._raycastGround();
      if (hit) {
        this.reticleMesh.position.copy(this._hitPoint);
        this.reticleMesh.material.opacity = 0.7 + Math.sin(time * 0.004) * 0.15;
        this.reticleMesh.visible = true;
        this.hasHit = true;
        if (!this._wasDetected) {
          document.dispatchEvent(new CustomEvent('surface-detected'));
          this._wasDetected = true;
        }
      } else {
        this._loseSurface();
      }
    },

    // Hide the reticle and, on the falling edge only, emit `surface-lost`.
    // Mirrors the old `_wasHit` edge-detection so each event fires once per
    // transition.
    _loseSurface: function() {
      if (this.reticleMesh && this.reticleMesh.visible) {
        this.reticleMesh.visible = false;
      }
      this.hasHit = false;
      if (this._wasDetected) {
        document.dispatchEvent(new CustomEvent('surface-lost'));
        this._wasDetected = false;
      }
    },

    // True when the 8th Wall engine appears to be running. Done purely with
    // existence checks so this never throws on desktop where XR8 is absent.
    _engineActive: function() {
      try {
        if (typeof XR8 === 'undefined' || !XR8) { return false; }
        // The scene registers an `xrweb` system when 8th Wall is wired up.
        if (!this.el.sceneEl || !this.el.sceneEl.systems) { return false; }
        return !!this.el.sceneEl.systems.xrweb;
      } catch (e) {
        return false;
      }
    },

    // Cast a ray from screen-center through the A-Frame camera and intersect
    // it with the world ground plane (y = 0). Returns true and fills
    // `this._hitPoint` on success.
    _raycastGround: function() {
      try {
        var cameraEl = this.el.sceneEl.camera;
        if (!cameraEl) { return false; }
        // A-Frame's `sceneEl.camera` is the THREE camera; it has the helper
        // methods Raycaster relies on for unprojection.
        this._ray.origin.setFromMatrixPosition(cameraEl.matrixWorld);
        this._ray.direction
          .set(this._screenCenter.x, this._screenCenter.y, 0.5)
          .unproject(cameraEl)
          .sub(this._ray.origin)
          .normalize();

        var point = this._ray.intersectPlane(this._groundPlane, this._hitPoint);
        // intersectPlane returns null when the ray is parallel to / points
        // away from the plane (e.g. camera aimed at the ceiling).
        return !!point;
      } catch (e) {
        return false;
      }
    },

    // Local user tap placed the witness on a detected surface.
    _placeObject: function() {
      this.placed = true;
      this.reticleMesh.visible = false;
      var THREE = AFRAME.THREE;
      var pos = new THREE.Vector3();
      pos.copy(this.reticleMesh.position);
      // Defensive default if position somehow unset.
      if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
        pos.set(0, 0, -1.5);
      }
      document.dispatchEvent(new CustomEvent('object-placed', {
        detail: { x: pos.x, y: pos.y, z: pos.z, autoPlaced: false }
      }));
    },

    // Public: force placement straight ahead. Used by healing-sync.js when a
    // remote/auto trigger places the witness without a local tap. Same name
    // and semantics as the old component.
    autoPlace: function() {
      if (this.placed) { return; }
      this.placed = true;
      if (this.reticleMesh) { this.reticleMesh.visible = false; }
      document.dispatchEvent(new CustomEvent('object-placed', {
        detail: { x: 0, y: 0, z: -1.5, autoPlaced: true }
      }));
    },

    remove: function() {
      // Detach scene-level listeners.
      if (this._onReady) {
        this.el.sceneEl.removeEventListener('realityready', this._onReady);
      }
      if (this._onTrackingLost) {
        this.el.sceneEl.removeEventListener('xrerror', this._onTrackingLost);
        this.el.sceneEl.removeEventListener('xrtrackingstatus', this._onTrackingLost);
      }
      if (this._onSceneLoaded) {
        this.el.sceneEl.removeEventListener('loaded', this._onSceneLoaded);
      }
      // Detach canvas tap listeners.
      if (this.canvas && this._onTap) {
        this.canvas.removeEventListener('touchstart', this._onTap);
        this.canvas.removeEventListener('click', this._onTap);
      }
      // Dispose the reticle mesh.
      if (this.reticleMesh) {
        this.el.object3D.remove(this.reticleMesh);
        this.reticleMesh.geometry.dispose();
        this.reticleMesh.material.dispose();
        this.reticleMesh = null;
      }
    }
  });

})();
