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
 *  character-animator  — Full procedural 3D character in Three.js (no GLB dependency).
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
   * Builds a full procedural 3D character entirely in Three.js.
   * Mode A = war-zone soldier (sitting, wounded).
   * Mode B = healing angel (standing, wings, halo, flies upward on complete).
   * Transition: Mode A fades out while Mode B fades in, waits, then flies up.
   * ======================================================================= */
  AFRAME.registerComponent('character-animator', {
    schema: {
      healingPercent: { type: 'number', default: 0 },
      mode:           { type: 'string', default: 'a' }
    },

    /* ------------------------------------------------------------------
     * buildModeA — war-zone soldier sitting on the ground
     * ------------------------------------------------------------------ */
    buildModeA: function (group) {
      var THREE = AFRAME.THREE;

      var mk = function (geo, color, rough) {
        if (rough === undefined) { rough = 1.0; }
        return new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({ color: color, roughness: rough, metalness: 0 })
        );
      };

      // Head
      var head = mk(new THREE.SphereGeometry(0.12, 6, 5), 0x5c3d2e);
      head.position.set(0, 0.68, 0.08);
      head.rotation.x = 0.08;
      group.add(head);
      this.headMesh = head;

      // Torso
      var torso = mk(new THREE.BoxGeometry(0.30, 0.32, 0.18), 0x2a2218);
      torso.position.set(0, 0.38, 0.02);
      torso.rotation.x = -0.10;
      group.add(torso);
      this.torsoMesh = torso;

      // Left upper leg
      var leftUpperLeg = mk(new THREE.CylinderGeometry(0.085, 0.085, 0.28, 5), 0x2a2218);
      leftUpperLeg.position.set(-0.1, 0.30, 0.25);
      leftUpperLeg.rotation.set(-1.1, 0, 0.12);
      group.add(leftUpperLeg);

      // Right upper leg (mirror X)
      var rightUpperLeg = mk(new THREE.CylinderGeometry(0.085, 0.085, 0.28, 5), 0x2a2218);
      rightUpperLeg.position.set(0.1, 0.30, 0.25);
      rightUpperLeg.rotation.set(-1.1, 0, -0.12);
      group.add(rightUpperLeg);

      // Left lower leg
      var leftLowerLeg = mk(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 5), 0x2a2218);
      leftLowerLeg.position.set(-0.1, 0.14, 0.42);
      leftLowerLeg.rotation.set(0.5, 0, 0.1);
      group.add(leftLowerLeg);

      // Right lower leg (mirror X)
      var rightLowerLeg = mk(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 5), 0x2a2218);
      rightLowerLeg.position.set(0.1, 0.14, 0.42);
      rightLowerLeg.rotation.set(0.5, 0, -0.1);
      group.add(rightLowerLeg);

      // Left arm
      var leftArm = mk(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 5), 0x5c3d2e);
      leftArm.position.set(-0.20, 0.38, 0.18);
      leftArm.rotation.set(0.8, 0, -0.5);
      group.add(leftArm);

      // Right arm (mirror X)
      var rightArm = mk(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 5), 0x5c3d2e);
      rightArm.position.set(0.20, 0.38, 0.18);
      rightArm.rotation.set(0.8, 0, 0.5);
      group.add(rightArm);

      // Gun body
      var gunBody = mk(new THREE.BoxGeometry(0.16, 0.05, 0.05), 0x1a1a1a, 0.6);
      gunBody.position.set(0.26, 0.30, 0.22);
      gunBody.rotation.set(0.3, 0.3, 0.5);
      group.add(gunBody);

      // Gun barrel
      var gunBarrel = mk(new THREE.BoxGeometry(0.035, 0.035, 0.12), 0x111111, 0.6);
      gunBarrel.position.set(0.31, 0.27, 0.28);
      gunBarrel.rotation.set(0.3, 0.3, 0.5);
      group.add(gunBarrel);

      // Wound cracks on face (LineSegments)
      var crackPts = [
        new THREE.Vector3( 0.02,  0.76,  0.14), new THREE.Vector3( 0.09,  0.71,  0.14),
        new THREE.Vector3( 0.09,  0.71,  0.14), new THREE.Vector3( 0.12,  0.67,  0.12),
        new THREE.Vector3( 0.05,  0.73,  0.14), new THREE.Vector3( 0.02,  0.68,  0.13),
        new THREE.Vector3( 0.02,  0.69,  0.14), new THREE.Vector3(-0.03,  0.65,  0.12)
      ];
      var crackGeo = new THREE.BufferGeometry().setFromPoints(crackPts);
      this.crackMat   = new THREE.LineBasicMaterial({ color: 0x8b2020, transparent: true, opacity: 1.0 });
      this.crackLines = new THREE.LineSegments(crackGeo, this.crackMat);
      group.add(this.crackLines);
    },

    /* ------------------------------------------------------------------
     * buildModeB — healing angel standing upright
     * ------------------------------------------------------------------ */
    buildModeB: function (group) {
      var THREE = AFRAME.THREE;
      this.modeBMeshes = [];

      var self = this;
      var mkB = function (geo, color, emissive, eI) {
        if (emissive === undefined) { emissive = 0x000000; }
        if (eI       === undefined) { eI       = 0; }
        var mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            color:            color,
            roughness:        0.3,
            metalness:        0.1,
            emissive:         emissive,
            emissiveIntensity: eI,
            transparent:      true,
            opacity:          0
          })
        );
        return mesh;
      };

      // Head
      var head = mkB(new THREE.SphereGeometry(0.12, 6, 5), 0xc8a882);
      head.position.set(0, 1.38, 0);
      head.rotation.x = -0.2;
      group.add(head);
      this.modeBMeshes.push(head);

      // Torso
      var torso = mkB(new THREE.BoxGeometry(0.28, 0.36, 0.16), 0xf5f0e8, 0xfff8f0, 0.04);
      torso.position.set(0, 0.96, 0);
      group.add(torso);
      this.modeBMeshes.push(torso);

      // Left upper leg
      var leftUpperLeg = mkB(new THREE.CylinderGeometry(0.082, 0.082, 0.34, 5), 0xf5f0e8);
      leftUpperLeg.position.set(-0.09, 0.61, 0);
      group.add(leftUpperLeg);
      this.modeBMeshes.push(leftUpperLeg);

      // Right upper leg (mirror)
      var rightUpperLeg = mkB(new THREE.CylinderGeometry(0.082, 0.082, 0.34, 5), 0xf5f0e8);
      rightUpperLeg.position.set(0.09, 0.61, 0);
      group.add(rightUpperLeg);
      this.modeBMeshes.push(rightUpperLeg);

      // Left lower leg
      var leftLowerLeg = mkB(new THREE.CylinderGeometry(0.068, 0.068, 0.30, 5), 0xf5f0e8);
      leftLowerLeg.position.set(-0.09, 0.28, 0);
      group.add(leftLowerLeg);
      this.modeBMeshes.push(leftLowerLeg);

      // Right lower leg (mirror)
      var rightLowerLeg = mkB(new THREE.CylinderGeometry(0.068, 0.068, 0.30, 5), 0xf5f0e8);
      rightLowerLeg.position.set(0.09, 0.28, 0);
      group.add(rightLowerLeg);
      this.modeBMeshes.push(rightLowerLeg);

      // Left arm
      var leftArm = mkB(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 5), 0xf5f0e8);
      leftArm.position.set(-0.22, 0.98, 0);
      leftArm.rotation.set(0, 0, -0.3);
      group.add(leftArm);
      this.modeBMeshes.push(leftArm);

      // Right arm (mirror)
      var rightArm = mkB(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 5), 0xf5f0e8);
      rightArm.position.set(0.22, 0.98, 0);
      rightArm.rotation.set(0, 0, 0.3);
      group.add(rightArm);
      this.modeBMeshes.push(rightArm);

      // --- Wings ---
      // Left wing base vertices
      var wVerts = new Float32Array([
         0,     0,     0,
        -0.85,  0.25,  0,
        -0.65,  0.72,  0,
        -0.1,   0.55,  0,
        -0.28, -0.18,  0
      ]);
      var wIdx = [0, 1, 2,  0, 2, 3,  0, 4, 1];

      // Left wing geometry
      var wGeoL = new THREE.BufferGeometry();
      wGeoL.setAttribute('position', new THREE.BufferAttribute(wVerts.slice(), 3));
      wGeoL.setIndex(wIdx);
      wGeoL.computeVertexNormals();

      var wingMatL = new THREE.MeshStandardMaterial({
        color:            0xffffff,
        emissive:         0xfff5e6,
        emissiveIntensity: 0.15,
        side:             THREE.DoubleSide,
        transparent:      true,
        opacity:          0,
        roughness:        0.3,
        metalness:        0.05
      });
      var leftWing = new THREE.Mesh(wGeoL, wingMatL);
      leftWing.position.set(-0.14, 1.05, -0.12);
      leftWing.rotation.set(0.15, 0.2, 0.1);
      leftWing.userData.isWing = true;
      leftWing.userData.wingBaseRotZ = 0.1;
      leftWing.userData.wingDir = -1; // left flaps up when right flaps down
      group.add(leftWing);
      this.modeBMeshes.push(leftWing);

      // Right wing geometry (flip X coords)
      var wVertsR = wVerts.slice();
      for (var vi = 0; vi < wVertsR.length; vi += 3) {
        wVertsR[vi] = -wVertsR[vi]; // negate X
      }
      var wGeoR = new THREE.BufferGeometry();
      wGeoR.setAttribute('position', new THREE.BufferAttribute(wVertsR, 3));
      wGeoR.setIndex(wIdx);
      wGeoR.computeVertexNormals();

      var wingMatR = new THREE.MeshStandardMaterial({
        color:            0xffffff,
        emissive:         0xfff5e6,
        emissiveIntensity: 0.15,
        side:             THREE.DoubleSide,
        transparent:      true,
        opacity:          0,
        roughness:        0.3,
        metalness:        0.05
      });
      var rightWing = new THREE.Mesh(wGeoR, wingMatR);
      rightWing.position.set(0.14, 1.05, -0.12);
      rightWing.rotation.set(0.15, -0.2, -0.1);
      rightWing.userData.isWing = true;
      rightWing.userData.wingBaseRotZ = -0.1;
      rightWing.userData.wingDir = 1; // right flaps opposite to left
      group.add(rightWing);
      this.modeBMeshes.push(rightWing);

      // Halo
      var halo = mkB(
        new THREE.TorusGeometry(0.14, 0.012, 8, 24),
        0xd4a843,
        0xd4a843,
        0.4
      );
      halo.position.set(0, 1.58, 0);
      halo.rotation.x = 0.3;
      group.add(halo);
      this.modeBMeshes.push(halo);

      // Point light glow
      var glow = new THREE.PointLight(0xfff5e6, 0.7, 2.5);
      glow.position.set(0, 1.2, 0);
      group.add(glow);
      // Note: PointLight is NOT a Mesh, so we don't push it into modeBMeshes
      // (setGroupOpacity traverses isMesh only, which is correct)
    },

    /* ------------------------------------------------------------------
     * init
     * ------------------------------------------------------------------ */
    init: function () {
      var THREE = AFRAME.THREE;
      this.THREE = THREE;

      this.groupA = new THREE.Group();
      this.groupB = new THREE.Group();

      this.buildModeA(this.groupA);
      this.buildModeB(this.groupB);

      this.groupB.visible = false;

      this.el.object3D.add(this.groupA);
      this.el.object3D.add(this.groupB);

      // Animation state
      this.transitioning       = false;
      this.transitionProgress  = 0;
      this.TRANSITION_DURATION = 1.5;

      this.waiting     = false;
      this.waitElapsed = 0;
      this.WAIT_DURATION = 2.0;

      this.flyingUp   = false;
      this.flyElapsed = 0;
      this.FLY_DURATION = 3.2;
      this.FLY_END_Y    = 2.8;

      this.modeBStarted = false;
    },

    /* ------------------------------------------------------------------
     * update — react to schema data changes
     * ------------------------------------------------------------------ */
    update: function (oldData) {
      // Mode A → B transition trigger
      if (
        oldData &&
        oldData.mode === 'a' &&
        this.data.mode === 'b' &&
        !this.modeBStarted
      ) {
        this.startModeTransition();
      }

      // Healing visuals
      if (oldData && oldData.healingPercent !== this.data.healingPercent) {
        this.applyHealingVisuals(this.data.healingPercent);
      }
    },

    /* ------------------------------------------------------------------
     * applyHealingVisuals — lerp wounds away as healing advances
     * ------------------------------------------------------------------ */
    applyHealingVisuals: function (percent) {
      var THREE = AFRAME.THREE;
      var t = percent / 100;

      // Fade wound cracks
      if (this.crackMat) {
        this.crackMat.opacity = 1 - t;
      }

      // Lerp torso color from war-dark to slightly lighter
      if (this.torsoMesh && this.torsoMesh.material) {
        var colorA = new THREE.Color(0x2a2218);
        var colorB = new THREE.Color(0x4a3c28);
        this.torsoMesh.material.color.copy(colorA).lerp(colorB, t);
      }
    },

    /* ------------------------------------------------------------------
     * startModeTransition — begin cross-fade from A to B
     * ------------------------------------------------------------------ */
    startModeTransition: function () {
      this.modeBStarted = true;
      this.groupB.visible = true;
      // Ensure all mode B meshes start at opacity 0
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
      var dt = delta / 1000;

      // ── Mode A idle breathing (only while sitting, before transition) ──
      if (!this.modeBStarted && this.groupA.visible) {
        // Slow sine wave: ~4-second breath cycle
        var breathe   = Math.sin(time * 0.00157) * 0.006;  // ±6mm vertical
        var sway      = Math.sin(time * 0.00094) * 0.004;  // ±0.23° side sway
        var slumpRock = Math.sin(time * 0.00063) * 0.003;  // ±0.17° forward rock

        // Torso rises/falls with each breath
        if (this.torsoMesh) {
          this.torsoMesh.position.y = 0.38 + breathe;
          this.torsoMesh.scale.y    = 1 + breathe * 0.8;
        }
        // Head follows the torso
        if (this.headMesh) {
          this.headMesh.position.y = 0.68 + breathe;
        }
        // Whole figure gently sways / rocks — looks like quiet despair
        this.groupA.rotation.z = sway;
        this.groupA.rotation.x = slumpRock;

        // Wound cracks pulse around their healed opacity (oscillate, don't decay)
        if (this.crackMat) {
          var baseOpacity = 1 - (this.data.healingPercent / 100);
          this.crackMat.opacity = Math.max(0, baseOpacity + Math.sin(time * 0.0031) * 0.12);
        }
      }

      // ── Mode B idle: wing flap + gentle bob while standing ──
      if (this.modeBStarted && this.groupB.visible) {
        // Wing beat: ~2.8-second cycle, ±8° rotation
        var flapAngle = Math.sin(time * 0.00224) * 0.14;
        this.groupB.traverse(function (child) {
          if (child.userData.isWing) {
            child.rotation.z = child.userData.wingBaseRotZ
              + flapAngle * child.userData.wingDir;
          }
        });
        // Bob up/down while waiting (before fly-up)
        if (this.waiting) {
          this.groupB.position.y = Math.sin(time * 0.002) * 0.018;
        }
      }

      // Cross-fade transition A → B
      if (this.transitioning) {
        this.transitionProgress = Math.min(1, this.transitionProgress + dt / this.TRANSITION_DURATION);
        this.setGroupOpacity(this.groupA, 1 - this.transitionProgress);
        this.setGroupOpacity(this.groupB,     this.transitionProgress);

        if (this.transitionProgress >= 1) {
          this.transitioning      = false;
          this.groupA.visible     = false;
          this.waiting            = true;
          this.waitElapsed        = 0;
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
     * remove — clean up Three.js objects when component is detached
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

      if (this.crackMat)   { this.crackMat.dispose(); }
      if (this.crackLines && this.crackLines.geometry) {
        this.crackLines.geometry.dispose();
      }
    }
  });

})();
