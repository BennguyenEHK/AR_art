# Instructions — getting AR_art onto your wall

> **Good news — you can skip Part 1 if you just want to test the app.**
> A working starter marker is already committed:
> - `public/markers/board.png` — the image you print
> - `public/targets/board.mind` — the compiled fingerprint (already done)
>
> Just **print `board.png` on A4**, glue/tape it to your wooden board, run `npm run dev`, and aim a phone at it. The AR scene will appear on top.
>
> The rest of this file explains *why* that works, *how* to swap the marker for something more thematic, and *what makes a marker good or bad*.

---

## Contents

1. [Marker concepts — what is a marker, Path A vs Path B](#1-marker-concepts)
2. [Good marker vs bad marker — checklist](#2-good-marker-vs-bad-marker)
3. [Swap in your own marker (the full workflow)](#3-swap-in-your-own-marker)
4. [Get a 3D model (.glb)](#4-get-a-3d-model-glb)
5. [Run it locally](#5-run-it-locally)
6. [Deploy to Vercel](#6-deploy-to-vercel)
7. [Turn on shared (multiplayer) mode](#7-turn-on-shared-multiplayer-mode)
8. [Troubleshooting](#8-troubleshooting)
9. [File map](#9-file-map)

---

## 1. Marker concepts

In **marker-based AR**, the phone's camera looks for a *known* image. When it sees that image in the live video, it overlays the 3D scene exactly where the image sits in the world. We feed MindAR two artifacts:

| File | What it is | Where it lives |
| --- | --- | --- |
| `board.png` (or `.jpg`) | The picture you actually **print** | `public/markers/board.png` |
| `board.mind` | The **compiled fingerprint** of that picture | `public/targets/board.mind` |

You generate `board.mind` *from* the source image using a free in-browser compiler.

### Path A — design/download a marker, print it, glue to the board (recommended)

Pick or design a 2D image, compile it, **print** it, fix it to whatever surface you want the AR to appear on. The wooden board becomes a meaningful physical pedestal; the printed paper is what the camera tracks.

**Why we recommend this:** plain wood, painted walls, and most physical objects don't have enough rich, irregular detail to track reliably. A printed marker is consistent, controllable, and re-printable.

> **This is the path the project ships with.** The starter marker is MindAR's canonical demo card — guaranteed to track well from any reasonable angle.

### Path B — use the surface itself (no print)

If your physical object already has rich, busy detail (carved wood, hand-painted symbols, antique illustrations), you can photograph it and use that photo as the marker.

**The catch:** you must shoot it **dead-on overhead, perpendicular to the surface**. MindAR is a 2D image tracker — it does not understand 3D shape. Any tilt in your reference photo bakes that perspective into the fingerprint, so the tracker will only lock when you re-create that exact tilt at runtime. From any other angle: wobble or no track.

```
   📱  ← phone parallel to surface, ~30–60 cm above
    │
    │
   ────────────  ← surface flat, even diffuse light
```

For our project (a plain pine board, mostly straight grain), Path A is the right call.

---

## 2. Good marker vs bad marker

MindAR latches onto **feature points** — corners, edges, dots, junctions where local pixels are uniquely arranged. The more unique features your image has, and the less repetitive they are, the better tracking gets.

### What works

- ✅ **Lots of irregular detail** — busy illustrations, woodcuts, mandalas, hand-drawn ink art, photographs of textured natural objects.
- ✅ **High contrast** — strong black-on-light or saturated colour edges.
- ✅ **Asymmetry** — clear "top vs bottom, left vs right" landmarks so the tracker can resolve orientation.
- ✅ **Roughly square or 3:4-ish** aspect ratio.
- ✅ **Matte print on plain paper.**

### What breaks tracking

- ❌ **Mostly empty space** — a single logo on a white field has too few features.
- ❌ **Repeating patterns** — wallpaper, tessellations, even straight wood grain. Every stripe looks like every other stripe; the tracker can't pin position.
- ❌ **Smooth gradients / pastels** — no edges to lock onto.
- ❌ **Glossy or laminated print** — reflections change every frame, tracking jitters or fails.
- ❌ **Photos of glossy / curved / 3D objects** — the marker needs to be *flat*.
- ❌ **Tiny print** — under ~A6 (postcard) and tracking quality drops fast on phones held at a normal viewing distance.

### Real-world example: evaluating a phone photo

If you photograph your own surface and want to use it as a marker (Path B), apply this checklist:

| Property | Good | Bad |
| --- | --- | --- |
| Camera angle | Dead-on overhead | Tilted / angled |
| Surface in frame | Just the trackable region | Includes table cloth, hands, room |
| Lighting | Even, diffuse, no glare | Hot spots, harsh shadows, flash |
| Focus | Sharp throughout | Motion blur, soft edges |
| Resolution | 800–1500 px on long edge | 100 px thumbnail OR 24 MP raw |
| Surface itself | Carved/painted/textured/inked | Plain, glossy, or repeating grain |

A 3/4 angle photo of a plain pine board will fail on **every** row of that table. That's why we ship Path A as default.

### Format: PNG vs JPG

**Both work.** The MindAR compiler accepts either. JPG is slightly preferred for photographs (smaller files, faster compile, and the tracker uses gradient features that are robust to JPG compression). PNG is better for sharp computer-generated edges (logos, vector exports, line art). The output `.mind` file is identical in size and quality regardless of input format.

---

## 3. Swap in your own marker

When you're ready to replace the starter MIND-card with something thematic to your project (peace dove, mandala, custom artwork, etc.):

### Step 1 — pick or create the source image

Sources for free, high-tracking-quality images:

| Source | What to look for |
| --- | --- |
| [Wikimedia Commons](https://commons.wikimedia.org) | Public-domain woodcuts, engravings, mandalas. Search "peace dove woodcut", "ornament engraving", "Hokusai print". |
| [The British Library Flickr Commons](https://www.flickr.com/photos/britishlibrary) | Public-domain illustrated book pages — extremely busy, perfect for tracking. |
| [The Met Open Access](https://www.metmuseum.org/art/collection/search?searchField=All&showOnly=openAccess) | High-res CC0 art. Filter by "open access". |
| [Canva](https://canva.com) / [Figma](https://figma.com) | Design your own. Aim for: dense linework, high contrast, asymmetric. |

Save it as `board.png` or `board.jpg`.

### Step 2 — compile to `.mind`

1. Open the official MindAR compiler — it runs entirely in your browser, no upload to a server:

   <https://hiukim.github.io/mind-ar-js-doc/tools/compile>

2. Drop your image. Click **Start**. Wait 5–60 seconds.
3. Click **Download**. You get a file called `targets.mind`.
4. Rename it to `board.mind` and put it at `public/targets/board.mind` (replacing the starter).
5. Replace `public/markers/board.png` with your source image too (so future-you remembers what you printed).

### Step 3 — print the marker

1. Open `board.png` and **print at full A4 / Letter size**.
2. Lay flat on a hard, matte surface. Glue or tape to your wooden board for the project setup.
3. Avoid shiny lamination — paper-on-glue is ideal.
4. Even ambient light beats bright spotlights.

You're done — refresh the AR page and the new marker is live.

---

## 4. Get a 3D model (.glb)

The AR scene loads `public/models/statue.glb`. **If that file is missing, the app shows a glowing placeholder shape** so you can verify tracking works without a model. Drop in a real one whenever you're ready.

### Where to get free models

| Source | Notes |
| --- | --- |
| [Sketchfab — Downloadable + CC](https://sketchfab.com/3d-models?features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b) | Search "statue", "monument", "buddha", "dove". → **Download 3D Model → glTF (.glb)**. |
| [Poly Pizza](https://poly.pizza) | Public-domain & CC0. Click model → "GLB" button. |
| [Quaternius](https://quaternius.com) | Free low-poly packs — perfect for the calm, minimal aesthetic of the project. |
| [OpenGameArt](https://opengameart.org/art-search?keys=statue) | Older but reliable. Filter by glTF/glb format. |

### Format requirements

- **Must be `.glb`** (binary glTF). If you only have `.gltf` + textures, re-export from Blender → Export → glTF 2.0 → Format: GLB.
- **Reasonable size:** under ~5 MB. Decimate in Blender if it's bigger; phones thank you.
- **Centred at origin**, base of model on the `y=0` plane is ideal.
- If the model floats or sinks at runtime, edit `placed.position.y` in `src/components/ARScene.tsx`.
- If it lands too big or too small, edit `placed.scale.setScalar(0.5)` in the same file.

Drop the file in:

```
public/models/statue.glb
```

Refresh the AR page; placeholder is replaced.

---

## 5. Run it locally

```bash
npm install        # one-time
npm run dev        # http://localhost:3000
```

> **Mobile testing in dev:** browsers refuse camera access on plain `http://` for non-localhost hosts. To test on your phone while the laptop runs `npm run dev`:
>
> - **Easiest:** deploy to Vercel (next section) and use the preview URL — Vercel gives you HTTPS for free.
> - `next dev --experimental-https` — gives you `https://localhost:3000` with a self-signed cert.
> - **ngrok** — `ngrok http 3000` then visit the `https://...ngrok-free.app` URL on the phone.

---

## 6. Deploy to Vercel

You said you want to do this **manually via the Vercel dashboard** (no CLI). Here's the exact flow:

1. Make sure your latest commit is pushed:
   ```bash
   git push
   ```

2. Open <https://vercel.com/new>.
3. Click **Import** next to the `BennguyenEHK/AR_art` repo. (Authorize the GitHub app if prompted.)
4. **Framework preset:** Vercel auto-detects Next.js. Leave defaults.
5. **Environment variables** — paste these three (they match `.env.example`):

   | Name | Value (for now) |
   | --- | --- |
   | `NEXT_PUBLIC_ABLY_ENABLED` | `false` |
   | `NEXT_PUBLIC_ABLY_KEY` | *(leave empty)* |
   | `NEXT_PUBLIC_ABLY_CHANNEL` | `ar-art:peace-board:v1` |

6. Click **Deploy**.

When the build finishes you get a URL like `https://ar-art-{your-username}.vercel.app`. That's already HTTPS, so phones will let it open the camera.

> **Camera permissions on iOS Safari:** Safari shows a one-shot dialog *only* on a user gesture. The "Begin AR" tap satisfies that — don't worry.

---

## 7. Turn on shared (multiplayer) mode

Right now the app runs **solo per device** — every viewer sees their own local AR scene with no cross-sync. This is intentional for the first ship.

When you're ready for "everyone sees the same thing live":

1. Sign up at <https://ably.com/sign-up> (free tier — no credit card; 6M messages/month, 200 peak connections).
2. Create an app → **API Keys** → copy the key (looks like `xVLyHw.somerandom:Abc123XYZ...`).
3. In Vercel project → **Settings → Environment Variables**, set:
   - `NEXT_PUBLIC_ABLY_ENABLED` = `true`
   - `NEXT_PUBLIC_ABLY_KEY` = *(your key)*
4. **Redeploy** (Vercel → Deployments → latest → ⋯ → Redeploy).

All clients on the same `NEXT_PUBLIC_ABLY_CHANNEL` will then share state in real time. The current code syncs the rotation of the displayed object as a proof-of-concept; future phases will sync agent positions, statue progress, etc.

> **Local testing with Ably on:** add the same three vars to `.env.local` and restart `npm run dev`.

---

## 8. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Black screen, "AR could not start" | Browser blocked camera. Allow it in site settings, reload. |
| Camera opens but nothing tracks | Wrong `.mind` file, OR marker out of frame, OR poor lighting. Re-check Part 3. |
| Tracking jitters / "slides" | Marker has too few unique features OR is repetitive. Swap for a busier image. |
| Model is huge / tiny | Edit `placed.scale.setScalar(0.5)` in `src/components/ARScene.tsx`. |
| Model floats / sinks | Edit `placed.position.y` in `src/components/ARScene.tsx`. |
| `.glb` won't load | Re-export from Blender as **glTF 2.0 → Format: glb**. Check console for specific error. |
| Mobile dev camera doesn't open | Page must be HTTPS. Use Vercel URL or ngrok. |
| Build fails locally | Make sure you ran `npm install` and you're on Node 20+. |

---

## 9. File map

```
public/
  markers/
    board.png            ← the image you print  (ships pre-loaded with MindAR's demo)
  targets/
    board.mind           ← compiled marker fingerprint  (ships pre-loaded)
  models/
    statue.glb           ← the AR object  (you provide)
src/
  app/
    layout.tsx           ← fonts + viewport
    page.tsx             ← landing page
    ar/page.tsx          ← /ar route, dynamic-loads ARScene
    globals.css          ← palette + typography
  components/
    ARScene.tsx          ← MindAR + Three.js — the actual AR code
  lib/
    ably.ts              ← realtime client (auto-disables when no key)
    sceneState.ts        ← shared scene state types + pub/sub
  types/
    mind-ar.d.ts         ← type shim (mind-ar ships JS only)
.env.example             ← template
.env.local               ← your actual values (git-ignored)
```

Happy building.
