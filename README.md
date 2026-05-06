# AR_art — web AR peace board

A browser-based marker-tracked AR experience. Print the board, point any phone, and the scene rises out of the wood. Designed to grow into a multiplayer Statue of Peace where everyone connected sees the same shared environment in real time.

## Status — phase 01

- [x] Next.js 16 + TS + Tailwind 4 spine
- [x] Marker-based AR (MindAR + Three.js)
- [x] Shared state plumbing (Ably) — **currently disabled** (toggle via env var)
- [ ] User-controlled agents (deferred)
- [ ] Contribution / progress system (deferred)
- [ ] Sound / completion flow (deferred)

## Quick start

```bash
npm install        # already done if you cloned after setup
npm run dev        # http://localhost:3000
```

You will need to drop two assets before AR works:

- `public/targets/board.mind` — compiled marker fingerprint
- `public/models/statue.glb` — the 3D object (optional; falls back to a placeholder)

**See [`instructions.md`](./instructions.md) for the full step-by-step** (marker compilation, model sources, Vercel deploy, enabling shared multiplayer mode).

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind 4 |
| AR tracking | [MindAR](https://hiukim.github.io/mind-ar-js-doc/) (image targets) |
| 3D | [Three.js](https://threejs.org) |
| Realtime | [Ably](https://ably.com) (free tier, gated by env flag) |
| Hosting | [Vercel](https://vercel.com) |

## Project layout

```
public/
  markers/          ← the printable image
  targets/          ← compiled .mind files
  models/           ← .glb 3D assets
src/
  app/              ← App Router pages
  components/       ← ARScene + UI
  lib/              ← ably + sceneState
  types/            ← mind-ar.d.ts shim
```

## Project plan

The full vision is in [`projectIdea.md`](./projectIdea.md). This first ship covers tracking + the shared-state spine only — agents, contribution, audio land in later phases.
