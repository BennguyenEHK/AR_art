(function() {
  'use strict';

  AFRAME.registerComponent('webxr-placement', {
    schema: {
      placed: { type: 'boolean', default: false }
    },

    init: function() {
      this.hitTestSource = null;
      this.hitTestSourceRequested = false;
      this.placed = false;
      this.hasHit = false;
      this._wasHit = false;
      this.reticleMesh = null;
      this._onTap = null;

      var THREE = AFRAME.THREE;

      // Inner ring reticle — geometry pre-rotated so it lies flat on surfaces.
      // matrixAutoUpdate=false lets us set the matrix directly from XR hit-test pose.
      var geometry = new THREE.RingGeometry(0.08, 0.12, 32).rotateX(-Math.PI / 2);
      var material = new THREE.MeshBasicMaterial({
        color: 0xd4a843,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });
      this.reticleMesh = new THREE.Mesh(geometry, material);
      this.reticleMesh.matrixAutoUpdate = false;
      this.reticleMesh.visible = false;
      this.el.object3D.add(this.reticleMesh);

      var self = this;

      this.el.sceneEl.addEventListener('enter-vr', function() {
        self._setupHitTest();
      });

      this.el.sceneEl.addEventListener('exit-vr', function() {
        self._cleanupHitTest();
      });

      this._onTap = function(evt) {
        if (self.placed || !self.hasHit) return;
        self._placeObject();
      };
      this.el.sceneEl.addEventListener('click', this._onTap);
    },

    _setupHitTest: function() {
      if (this.hitTestSourceRequested) return;
      this.hitTestSourceRequested = true;
      var session = this.el.sceneEl.renderer.xr.getSession();
      if (!session) { this.hitTestSourceRequested = false; return; }
      try {
        var self = this;
        session.requestReferenceSpace('viewer').then(function(viewerSpace) {
          return session.requestHitTestSource({ space: viewerSpace });
        }).then(function(source) {
          self.hitTestSource = source;
          session.addEventListener('end', function() {
            self.hitTestSource = null;
            self.hitTestSourceRequested = false;
          });
        }).catch(function(e) {
          console.warn('[webxr-placement] hit-test source failed:', e);
          self.hitTestSourceRequested = false;
        });
      } catch(e) {
        console.warn('[webxr-placement] _setupHitTest error:', e);
        this.hitTestSourceRequested = false;
      }
    },

    tick: function(time) {
      if (this.placed || !this.hitTestSource) return;
      var renderer = this.el.sceneEl.renderer;
      if (!renderer.xr.isPresenting) return;
      var frame = renderer.xr.getFrame ? renderer.xr.getFrame() : null;
      if (!frame) return;
      var results;
      try { results = frame.getHitTestResults(this.hitTestSource); } catch(e) { return; }
      if (results && results.length > 0) {
        var refSpace = renderer.xr.getReferenceSpace();
        var pose = results[0].getPose(refSpace);
        if (pose) {
          this.reticleMesh.matrix.fromArray(pose.transform.matrix);
          // Pulse opacity
          this.reticleMesh.material.opacity = 0.7 + Math.sin(time * 0.004) * 0.15;
          this.reticleMesh.visible = true;
          this.hasHit = true;
          if (!this._wasHit) {
            document.dispatchEvent(new CustomEvent('surface-detected'));
            this._wasHit = true;
          }
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

    _placeObject: function() {
      this.placed = true;
      this.reticleMesh.visible = false;
      var THREE = AFRAME.THREE;
      var pos = new THREE.Vector3();
      pos.setFromMatrixPosition(this.reticleMesh.matrix);
      document.dispatchEvent(new CustomEvent('object-placed', {
        detail: { x: pos.x, y: pos.y, z: pos.z, autoPlaced: false }
      }));
      this.el.sceneEl.removeEventListener('click', this._onTap);
    },

    autoPlace: function() {
      if (this.placed) return;
      this.placed = true;
      if (this.reticleMesh) this.reticleMesh.visible = false;
      // Place 1.5m ahead, on floor
      document.dispatchEvent(new CustomEvent('object-placed', {
        detail: { x: 0, y: 0, z: -1.5, autoPlaced: true }
      }));
      if (this._onTap && this.el.sceneEl) {
        this.el.sceneEl.removeEventListener('click', this._onTap);
      }
    },

    _cleanupHitTest: function() {
      this.hitTestSource = null;
      this.hitTestSourceRequested = false;
      if (this.reticleMesh) this.reticleMesh.visible = false;
      this.hasHit = false;
      this._wasHit = false;
    },

    remove: function() {
      if (this._onTap && this.el.sceneEl) {
        this.el.sceneEl.removeEventListener('click', this._onTap);
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
