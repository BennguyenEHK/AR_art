# Instructions — getting AR_art onto your wall

This file walks you through the two assets you still need to drop in:

1. **A printable marker** + its compiled `.mind` fingerprint (so the camera knows the board).
2. **A 3D model** (`.glb`) (so something appears on the board).

Plus how to **deploy to Vercel** and how the **shared multiplayer view** works.

> **You don't need to write any code for any of the steps below.**
> Everything is drag-and-drop into `/public/...`, then refresh the page.

---

## Part 1 — Make the AR marker (the printable board)

### What is a "marker"?

In **marker-based AR**, the phone's camera looks for a *known* image. When it sees that image in the live video feed, it overlays the 3D scene on top of it. We give MindAR two things:

| File | What it is | Where it lives |
| --- | --- | --- |
| `board.png` (or `.jpg`) | The picture you actually **print** | `/public/markers/board.png` |
| `board.mind` | The **compiled fingerprint** of that picture | `/public/targets/board.mind` |

You generate `board.mind` *from* `board.png` using a free in-browser tool — no install required.

### Step 1 — pick (or design) your marker image

You can use **any** image. Good markers have:

- Lots of irregular detail (think: textured photo, hand-drawn pattern, a busy logo).
- High contrast — strong edges, not pastels.
- A roughly square aspect ratio (works best for board placement).

Bad markers:

- Mostly empty space, gradients, or large flat colours.
- Repeating patterns (the tracker confuses identical regions).
- Photos of glossy / reflective objects.

> **Suggested for first run:** use a public-domain peace dove woodblock print, or any sketchy ink illustration of medium complexity. Even a screenshot of a busy book cover works.

Save the image you chose as:

```
public/markers/board.png
```

### Step 2 — compile it into a `.mind` file

1. Open MindAR's official compiler (it runs entirely in your browser, nothing is uploaded):

   <https://hiukim.github.io/mind-ar-js-doc/tools/compile>

2. Click **"+"** (or the upload area) and pick the same `board.png` from step 1.
3. Click **Start**. It takes ~5–60 seconds depending on image size.
4. Click **Download**. You get a file called `targets.mind`.
5. Rename it to `board.mind`.
6. Move it to:

   ```
   public/targets/board.mind
   ```

That's it. The `ARScene` component reads `/targets/board.mind` automatically — no code change needed.

### Step 3 — print the marker

1. Open `public/markers/board.png` and **print it** at full page size (A4 or US Letter — both work).
2. Lay it **flat on a hard surface** (not curled, not glossy laminated; matte print is best).
3. Even lighting matters more than bright lighting. Avoid hot spotlights.

You're ready to scan.

---

## Part 2 — Get a sample 3D model (.glb)

The AR scene loads `/public/models/statue.glb`. If that file is missing, the app shows a glowing placeholder shape so you can still see the tracking working — but a real model is more fun.

### Where to get free models

| Source | What to look for |
| --- | --- |
| **Sketchfab** — <https://sketchfab.com/3d-models?features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b> (CC-BY filter applied) | Search "statue", "monument", "buddha", "dove". Click the model → **Download 3D Model** → choose **glTF (.glb)**. |
| **Poly Pizza** — <https://poly.pizza> | Public-domain & CC0. Click a model → "GLB" download. |
| **OpenGameArt** — <https://opengameart.org/art-search?keys=statue> | Older but free. Filter for glTF/glb. |

### Format requirements

- **Must be `.glb`** (binary glTF). If you only have a `.gltf` + textures + bins, convert with [gltfpack](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md) or just re-export.
- **Reasonable size:** under ~5 MB is comfortable on phones. Decimate in Blender if it's bigger.
- **Centred at origin** with feet on the `y=0` plane is ideal. If the model floats or sinks, edit the `.position.y` line in `src/components/ARScene.tsx` (it's commented).

### Where to drop it

```
public/models/statue.glb
```

That's all. Refresh the AR page; the placeholder is replaced by your model.

> **Tip — scale:** `ARScene` applies `scale.setScalar(0.5)` by default. If the model lands too big or too small relative to your printed board, change that value in `src/components/ARScene.tsx`.

---

## Part 3 — Run it locally

```bash
npm run dev
```

Open <http://localhost:3000>. Click **Begin AR**.

> **Mobile testing on dev:** browsers refuse camera access on `http://` for non-localhost hosts. To test on your phone while the laptop runs `npm run dev`, use one of:
>
> - `next dev --experimental-https` (newer Next.js) — gives you `https://localhost:3000`.
> - **ngrok** — `ngrok http 3000` and visit the `https://...ngrok-free.app` URL on the phone.
> - Just deploy to Vercel and use the preview URL (recommended once you're happy locally).

---

## Part 4 — Deploy to Vercel

You said you want to do this **manually via the Vercel dashboard** (no CLI). Here's the exact path:

1. Push the current branch to GitHub:
   ```bash
   git add .
   git commit -m "feat: initial AR_art scaffold"
   git push
   ```

2. Go to <https://vercel.com/new>.
3. Click **Import** next to the `BennguyenEHK/AR_art` repo.
4. **Framework preset:** Vercel auto-detects Next.js. Leave defaults.
5. **Environment variables** — paste these three (they match `.env.example`):

   | Name | Value (for now) |
   | --- | --- |
   | `NEXT_PUBLIC_ABLY_ENABLED` | `false` |
   | `NEXT_PUBLIC_ABLY_KEY` | *(leave empty)* |
   | `NEXT_PUBLIC_ABLY_CHANNEL` | `ar-art:peace-board:v1` |

6. Click **Deploy**.

When the build finishes you get a URL like `https://ar-art.vercel.app`. That's already HTTPS, so phones will let it open the camera.

> **Camera permissions on iOS:** Safari shows a one-shot dialog *only* on a user gesture. The "Begin AR" tap satisfies that — don't worry.

---

## Part 5 — Shared (multiplayer) viewing — currently OFF

Right now the app runs **solo per device** — every viewer sees their own local AR scene with no cross-sync. This is intentional for the first ship.

When you're ready to switch on the "everyone sees the same thing" mode:

1. Sign up at <https://ably.com/sign-up> (free tier — no credit card).
2. Create an app → API Keys → copy the key (looks like `xVLyHw.somerandom:Abc123XYZ...`).
3. In Vercel project → **Settings → Environment Variables**, set:
   - `NEXT_PUBLIC_ABLY_ENABLED` = `true`
   - `NEXT_PUBLIC_ABLY_KEY` = *(your key)*
4. **Redeploy** (Vercel → Deployments → latest → ⋯ → Redeploy).

All clients connected to the same `NEXT_PUBLIC_ABLY_CHANNEL` will then share state in real time. The current code already syncs the rotation of the displayed object as a proof-of-concept; future phases will sync agent positions, statue progress, etc.

> **Local testing with Ably on:** add the same three vars to `.env.local` and restart `npm run dev`.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Black screen, "AR could not start" | Browser likely blocked camera. Allow it in site settings, reload. |
| Camera opens but nothing tracks | Marker `.mind` file missing OR poorly compiled. Re-run Part 1, Step 2. |
| Tracking is jittery | Better lighting, larger printed marker, hold phone steadier. Or reduce `filterMinCF` in `MindARThree` options. |
| Model is huge / tiny | Edit `placed.scale.setScalar(0.5)` in `src/components/ARScene.tsx`. |
| Model floats / sinks | Edit `placed.position.y` in `src/components/ARScene.tsx`. |
| `.glb` won't load | The model may have unsupported extensions. Convert via Blender → "Export glTF 2.0" → "Format: glb". |
| Mobile dev camera doesn't open | Page must be HTTPS. Use Vercel preview URL or ngrok. |

---

## File map (so you know where everything lives)

```
public/
  markers/board.png        ← the image you print
  targets/board.mind       ← compiled marker fingerprint
  models/statue.glb        ← the AR object
src/
  app/
    layout.tsx             ← fonts + viewport
    page.tsx               ← landing page
    ar/page.tsx            ← /ar route, dynamic-loads ARScene
    globals.css            ← palette + typography
  components/
    ARScene.tsx            ← MindAR + Three.js — the actual AR
  lib/
    ably.ts                ← realtime client (auto-disables when no key)
    sceneState.ts          ← shared scene state types + pub/sub
  types/
    mind-ar.d.ts           ← type shim (mind-ar ships JS only)
.env.example               ← template
.env.local                 ← your actual values (git-ignored)
```

Happy building.
