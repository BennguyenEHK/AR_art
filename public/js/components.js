/**
 * components.js — Custom A-Frame components for the Gun Violence Awareness AR experience.
 *
 * Four components are registered here:
 *
 *  tornado-effect      — 800-particle rising helical tornado surrounding the character.
 *                        Represents the violence / war environment.  Animates rotation
 *                        each frame via tick().  Schema: { intensity: number }
 *
 *  barbed-wire         — Helical barbed wire at mid-height built from THREE.LineSegments.
 *                        Spikes radiate outward from the helix.  Slowly rotates.
 *                        Schema: { intensity: number }
 *
 *  explosion-flash     — 5 flickering sprite planes simulating explosion sparks.
 *                        Each plane independently manages its own flicker timer.
 *                        Schema: { intensity: number }
 *
 *  character-animator  — Loads the Mode A / Mode B character from GLB files
 *                        (character-mode-{a,b}.glb); all animation is JS-driven.
 *                        Mode A: war-zone soldier sitting on the ground with wounds.
 *                        Mode B: healing angel that fades in then flies upward.
 *                        Schema: { healingPercent: number, mode: string }
 *
 * Usage (place BEFORE <a-scene> in ar.html after A-Frame and AR.js scripts):
 *   <script src="js/components.js"></script>
 *
 * Then use as attributes on any <a-entity>:
 *   <a-entity tornado-effect="intensity: 1.0"></a-entity>
 *   <a-entity barbed-wire="intensity: 1.0"></a-entity>
 *   <a-entity explosion-flash="intensity: 1.0"></a-entity>
 *   <a-entity character-animator="healingPercent: 0; mode: a"></a-entity>
 */

(function () {
  'use strict';

  /* =========================================================================
   * 1. tornado-effect
   * =========================================================================
   * 800-particle helical tornado built with THREE.Points.
   * Rotates faster when intensity is higher.
   * ======================================================================= */
  AFRAME.registerComponent('tornado-effect', {
    schema: {
      intensity: { type: 'number', default: 1.0 }
    },

    init: function () {
      var THREE = AFRAME.THREE;
      var N = 1500;
      var positions = new Float32Array(N * 3);

      for (var i = 0; i < N; i++) {
        var t = i / N;
        var turns = 6;
        var angle = t * Math.PI * 2 * turns;
        var radius = 0.2 + t * 0.5;
        var height = t * 1.6;
        var x = Math.cos(angle) * radius + (Math.random() - 0.5) * 0.22;
        var y = height + (Math.random() - 0.5) * 0.12;
        var z = Math.sin(angle) * radius + (Math.random() - 0.5) * 0.22;
        positions[i * 3]     = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
      }

      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      this.initialPositions = positions.slice();

      var material = new THREE.PointsMaterial({
        color: 0x4a3322,
        size: 0.046,
        transparent: true,
        sizeAttenuation: true,
        opacity: this.data.intensity * 0.85
      });

      this.particles = new THREE.Points(geometry, material);
      this.particles.visible = this.data.intensity > 0.005;
      this.el.object3D.add(this.particles);
    },

    update: function (oldData) {
      if (!this.particles) { return; }
      var intensity = this.data.intensity;
      this.particles.material.opacity = intensity * 0.85;
      this.particles.material.size    = 0.024 + intensity * 0.022;
      this.particles.visible          = intensity > 0.005;
    },

    tick: function (time, delta) {
      if (!this.particles) { return; }
      var rotationSpeed = 0.5 + this.data.intensity * 0.8;
      this.particles.rotation.y += rotationSpeed * (delta / 1000);
    },

    remove: function () {
      if (this.particles) {
        this.el.object3D.remove(this.particles);
        this.particles.geometry.dispose();
        this.particles.material.dispose();
      }
    }
  });

  /* =========================================================================
   * 2. barbed-wire
   * =========================================================================
   * Helical wire (120 points, 1.5 turns) with short radial spikes every
   * segment.  Rendered as THREE.LineSegments.  Rotates slowly each tick.
   * ======================================================================= */
  AFRAME.registerComponent('barbed-wire', {
    schema: {
      intensity: { type: 'number', default: 1.0 }
    },

    init: function () {
      var THREE = AFRAME.THREE;
      var HELIX_PTS  = 120;
      var TURNS      = 1.5;
      var RADIUS     = 0.65;
      var HEIGHT_MIN = 0.1;
      var HEIGHT_MAX = 0.9;
      var SPIKE_LEN  = 0.06;

      // Collect all line segment pairs (each pair = 2 vertices)
      var segmentPairs = [];

      // Build helix points first
      var helixPoints = [];
      for (var i = 0; i < HELIX_PTS; i++) {
        var t      = i / (HELIX_PTS - 1);
        var angle  = t * Math.PI * 2 * TURNS;
        var height = HEIGHT_MIN + t * (HEIGHT_MAX - HEIGHT_MIN);
        helixPoints.push(new THREE.Vector3(
          Math.cos(angle) * RADIUS,
          height,
          Math.sin(angle) * RADIUS
        ));
      }

      // Add wire segments (each consecutive pair)
      for (var j = 0; j < helixPoints.length - 1; j++) {
        segmentPairs.push(helixPoints[j].clone());
        segmentPairs.push(helixPoints[j + 1].clone());
      }

      // Add two radial spikes at every other helix point
      for (var k = 0; k < helixPoints.length; k += 2) {
        var p = helixPoints[k];
        // Compute outward unit vector (in XZ plane)
        var outward = new THREE.Vector3(p.x, 0, p.z).normalize();

        // Spike 1: straight outward
        var spikeDir1 = outward.clone();
        segmentPairs.push(p.clone());
        segmentPairs.push(p.clone().addScaledVector(spikeDir1, SPIKE_LEN));

        // Spike 2: outward + slight upward angle
        var spikeDir2 = new THREE.Vector3(
          outward.x,
          0.5,
          outward.z
        ).normalize();
        segmentPairs.push(p.clone());
        segmentPairs.push(p.clone().addScaledVector(spikeDir2, SPIKE_LEN));
      }

      var geometry = new THREE.BufferGeometry().setFromPoints(segmentPairs);
      var material = new THREE.LineBasicMaterial({
        color: 0x2a2218,
        transparent: true,
        opacity: this.data.intensity * 0.9
      });

      this.wire = new THREE.LineSegments(geometry, material);
      this.wire.visible = this.data.intensity > 0.005;
      this.el.object3D.add(this.wire);
    },

    update: function (oldData) {
      if (!this.wire) { return; }
      var intensity = this.data.intensity;
      this.wire.material.opacity = intensity * 0.9;
      this.wire.visible          = intensity > 0.005;
    },

    tick: function (time, delta) {
      if (!this.wire) { return; }
      this.wire.rotation.y += 0.05 * (delta / 1000);
    },

    remove: function () {
      if (this.wire) {
        this.el.object3D.remove(this.wire);
        this.wire.geometry.dispose();
        this.wire.material.dispose();
      }
    }
  });

  /* =========================================================================
   * 3. explosion-flash
   * =========================================================================
   * 5 PlaneGeometry sprites that flicker independently, simulating sparks.
   * Each has its own countdown timer.  Colors cycle through orange hues.
   * ======================================================================= */
  AFRAME.registerComponent('explosion-flash', {
    schema: {
      intensity: { type: 'number', default: 1.0 }
    },

    init: function () {
      var THREE = AFRAME.THREE;
      var FLASH_COLORS  = [0xff4400, 0xff6600, 0xffaa00];
      var NUM_FLASHES   = 5;

      this.flashGroup = new THREE.Group();
      this.flashPlanes = [];

      for (var i = 0; i < NUM_FLASHES; i++) {
        var geo = new THREE.PlaneGeometry(0.12, 0.12);
        var mat = new THREE.MeshBasicMaterial({
          color: FLASH_COLORS[i % FLASH_COLORS.length],
          transparent: true,
          opacity: this.data.intensity,
          side: THREE.DoubleSide
        });
        var mesh = new THREE.Mesh(geo, mat);

        // Random initial position
        var angle  = Math.random() * Math.PI * 2;
        var dist   = Math.random() * 0.55;
        mesh.position.set(
          Math.cos(angle) * dist,
          0.1 + Math.random() * 0.7,
          Math.sin(angle) * dist
        );

        // Random initial timer (ms)
        mesh.userData.nextFlicker = 100 + Math.random() * 300;
        mesh.visible = this.data.intensity > 0.1;

        this.flashGroup.add(mesh);
        this.flashPlanes.push(mesh);
      }

      this.el.object3D.add(this.flashGroup);
    },

    update: function (oldData) {
      if (!this.flashPlanes) { return; }
      var intensity = this.data.intensity;
      var visible   = intensity > 0.1;
      for (var i = 0; i < this.flashPlanes.length; i++) {
        var plane = this.flashPlanes[i];
        plane.visible = visible;
        if (visible) {
          plane.material.opacity = intensity;
        }
      }
    },

    tick: function (time, delta) {
      if (!this.flashPlanes) { return; }
      if (this.data.intensity <= 0.1) { return; }

      var THREE = AFRAME.THREE;
      var FLASH_COLORS = [0xff4400, 0xff6600, 0xffaa00];

      for (var i = 0; i < this.flashPlanes.length; i++) {
        var plane = this.flashPlanes[i];
        plane.userData.nextFlicker -= delta;

        if (plane.userData.nextFlicker <= 0) {
          // Toggle visibility
          plane.visible = !plane.visible;

          // New random timer 100-400 ms
          plane.userData.nextFlicker = 100 + Math.random() * 300;

          // New random position (slight shift)
          var angle = Math.random() * Math.PI * 2;
          var dist  = Math.random() * 0.55;
          plane.position.set(
            Math.cos(angle) * dist,
            0.1 + Math.random() * 0.7,
            Math.sin(angle) * dist
          );

          // Cycle color
          plane.material.color.setHex(FLASH_COLORS[Math.floor(Math.random() * FLASH_COLORS.length)]);
          plane.material.opacity = this.data.intensity;
        }
      }
    },

    remove: function () {
      if (this.flashGroup) {
        this.el.object3D.remove(this.flashGroup);
        for (var i = 0; i < this.flashPlanes.length; i++) {
          this.flashPlanes[i].geometry.dispose();
          this.flashPlanes[i].material.dispose();
        }
      }
    }
  });

  /* =========================================================================
   * 4. character-animator
   * =========================================================================
   * Loads pre-built GLB models for Mode A (war-zone soldier) and Mode B
   * (healing angel).  All animation is JS-driven; the GLBs contain no clips.
   * Node names expected in the GLBs: head, torso, arm_l, arm_r,
   * upper_leg_l/r, lower_leg_l/r, gun_body, gun_barrel, wing_l, wing_r,
   * halo.  wound_cracks is optional (present after Blender re-export).
   * ======================================================================= */
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
          var box = new self.THREE.Box3().setFromObject(gltf.scene);
          var size = box.getSize(new self.THREE.Vector3());
          console.log('[character-animator] Mode A bounds — min.y:', box.min.y.toFixed(3), 'max.y:', box.max.y.toFixed(3), 'height:', size.y.toFixed(3));
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
        // FLY_END_Y is expressed in world-space units (~2.8 m), but
        // groupB sits inside #character-root inside #scene-root which
        // has scale="5 5 5" in HTML. Without compensation the angel
        // would fly to world Y = 2.8 × 5 = 14, well past where the
        // camera frames the scene. Compensate by dividing the local
        // target by the parent chain's effective Y scale so the
        // world-space rise stays at FLY_END_Y regardless of how
        // scene-root is scaled.
        var parentScaleY = 1;
        var p = this.el.object3D.parent;
        while (p) {
          if (p.scale) { parentScaleY *= p.scale.y; }
          p = p.parent;
        }
        if (parentScaleY <= 0) { parentScaleY = 1; }
        this.groupB.position.y = (ease * this.FLY_END_Y) / parentScaleY;

        if (this.flyElapsed >= this.FLY_DURATION) {
          this.flyingUp = false;
          if (this.shadowDisc) { this.shadowDisc.visible = false; }
          document.dispatchEvent(new CustomEvent('mode-b-complete'));
        }
      }
    },

    /* ------------------------------------------------------------------
     * remove — dispose loaded scenes
     * ------------------------------------------------------------------ */
    remove: function () {
      var self = this;
      if (this.shadowDisc) {
        this.el.object3D.remove(this.shadowDisc);
        this.shadowDisc.geometry.dispose();
        this.shadowDisc.material.dispose();
        this.shadowDisc = null;
      }
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

})();
