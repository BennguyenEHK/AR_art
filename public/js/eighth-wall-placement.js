/**
 * eighth-wall-placement.js — 8th Wall world-tracking placement adapter.
 *
 * Fallback AR engine for iOS / non-WebXR devices. Mirrors the CustomEvent
 * contract of webxr-placement.js exactly, so the HUD + multiplayer layer
 * (components.js, healing-sync.js, end-sequence.js) stays engine-agnostic.
 *
 * Boundary events dispatched on `document`:
 *   surface-detected — no detail — a placeable surface is being tracked
 *   surface-lost     — no detail — surface tracking lost
 *   object-placed    — { x, y, z, autoPlaced } — witness placed
 *
 * Placement mechanism (documented 8th Wall pattern, per
 * 8thwall/aframe-world-effects-example):
 *   - The scene provides an invisible ground entity `#ar-ground.cantap`.
 *   - The camera carries `raycaster="objects: .cantap"` + a mouse cursor, so
 *     A-Frame fires a DOM-level `click` on the ground entity on every tap,
 *     carrying `evt.detail.intersection.point`.
 *   - tick() reads the camera raycaster's live `.cantap` intersection to drive
 *     the reticle and edge-detect surface-detected / surface-lost.
 *
 * Tracking lifecycle:
 *   - `realityready` (on the scene) — 8th Wall Web has initialized = engine ready.
 *   - `xrtrackingstatus` (on the scene) — fired whenever world-tracking status
 *     changes; detail.status === 'NORMAL' means tracking is healthy, any other
 *     value (LIMITED / NOT_AVAILABLE / INITIALIZING) means degraded/lost.
 *
 * Attached as: <a-entity id="placement-reticle" eighth-wall-placement>
 *
 * Defensive: never throws if XR8 / the camera raycaster is absent (e.g. the
 * file is loaded on a desktop browser that has no 8th Wall engine).
 */
(function () {
  'use strict';

  AFRAME.registerComponent('eighth-wall-placement', {
    schema: {
      placed: { type: 'boolean', default: false }
    },

    init: function () {
      this.placed = false;
      this.ready = false;          // realityready fired
      this.trackingOk = false;     // xrtrackingstatus === NORMAL
      this.hasHit = false;         // a .cantap intersection exists this frame
      this._wasHit = false;        // edge-detect state for surface-detected/lost
      this.reticleMesh = null;
      this.cameraEl = null;
      this.groundEl = null;

      var THREE = AFRAME.THREE;

      // Inner ring reticle — geometry pre-rotated so it lies flat on the ground.
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

      // Scratch vector reused every tick — no per-frame allocation.
      this._point = new THREE.Vector3();

      var self = this;

      // --- engine lifecycle ---------------------------------------------
      this._onRealityReady = function () {
        self.ready = true;
        self.trackingOk = true; // realityready implies tracking is up
      };
      this._onTrackingStatus = function (evt) {
        var status = evt && evt.detail && evt.detail.status;
        self.trackingOk = (status === 'NORMAL');
        if (!self.trackingOk && self._wasHit) {
          // tracking degraded — drop the surface immediately
          self.reticleMesh.visible = false;
          self.hasHit = false;
          self._wasHit = false;
          document.dispatchEvent(new CustomEvent('surface-lost'));
        }
      };
      this.el.sceneEl.addEventListener('realityready', this._onRealityReady);
      this.el.sceneEl.addEventListener('xrtrackingstatus', this._onTrackingStatus);

      // --- placement tap -------------------------------------------------
      // A-Frame fires `click` on the .cantap ground entity with the raycaster
      // intersection in evt.detail. Bind once the ground entity exists.
      this._onGroundClick = function (evt) {
        if (self.placed) return;
        var intersection = evt && evt.detail && evt.detail.intersection;
        if (!intersection || !intersection.point) return;
        self._placeObject(intersection.point);
      };
      this._bindGround = function () {
        self.groundEl = document.getElementById('ar-ground');
        if (self.groundEl) {
          self.groundEl.addEventListener('click', self._onGroundClick);
        }
      };
      // The ground entity may not be parsed yet when this component inits.
      if (this.el.sceneEl.hasLoaded) {
        this._bindGround();
      } else {
        this.el.sceneEl.addEventListener('loaded', this._bindGround);
      }
    },

    tick: function (time) {
      if (this.placed) return;

      // Resolve the camera entity lazily — it may parse after this component.
      if (!this.cameraEl) {
        this.cameraEl = this.el.sceneEl && this.el.sceneEl.camera
          ? this.el.sceneEl.camera.el
          : null;
        if (!this.cameraEl) return;
      }

      var raycasterComp = this.cameraEl.components &&
        this.cameraEl.components.raycaster;
      if (!raycasterComp) return;

      // The raycaster keeps a live list of intersections against `.cantap`.
      var intersections = raycasterComp.intersections;
      var hit = (intersections && intersections.length > 0) ? intersections[0] : null;

      if (hit && this.trackingOk) {
        this._point.copy(hit.point);
        this.el.object3D.worldToLocal(this._point);
        this.reticleMesh.position.copy(this._point);
        this.reticleMesh.material.opacity = 0.7 + Math.sin(time * 0.004) * 0.15;
        this.reticleMesh.visible = true;
        this.hasHit = true;
        if (!this._wasHit) {
          document.dispatchEvent(new CustomEvent('surface-detected'));
          this._wasHit = true;
        }
      } else {
        if (this.reticleMesh.visible) {
          this.reticleMesh.visible = false;
        }
        this.hasHit = false;
        if (this._wasHit) {
          document.dispatchEvent(new CustomEvent('surface-lost'));
          this._wasHit = false;
        }
      }
    },

    _placeObject: function (point) {
      this.placed = true;
      this.data.placed = true;
      if (this.reticleMesh) this.reticleMesh.visible = false;
      document.dispatchEvent(new CustomEvent('object-placed', {
        detail: { x: point.x, y: point.y, z: point.z, autoPlaced: false }
      }));
    },

    autoPlace: function () {
      if (this.placed) return;
      this.placed = true;
      this.data.placed = true;
      if (this.reticleMesh) this.reticleMesh.visible = false;
      document.dispatchEvent(new CustomEvent('object-placed', {
        detail: { x: 0, y: 0, z: -1.5, autoPlaced: true }
      }));
    },

    remove: function () {
      if (this.el.sceneEl) {
        this.el.sceneEl.removeEventListener('realityready', this._onRealityReady);
        this.el.sceneEl.removeEventListener('xrtrackingstatus', this._onTrackingStatus);
        this.el.sceneEl.removeEventListener('loaded', this._bindGround);
      }
      if (this.groundEl) {
        this.groundEl.removeEventListener('click', this._onGroundClick);
        this.groundEl = null;
      }
      if (this.reticleMesh) {
        this.el.object3D.remove(this.reticleMesh);
        this.reticleMesh.geometry.dispose();
        this.reticleMesh.material.dispose();
        this.reticleMesh = null;
      }
    }
  });

})();
