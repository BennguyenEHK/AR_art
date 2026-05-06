# WebAR Statue of Peace — Precise Plan

## 1. Goal

Build a browser-based WebAR multiplayer experience where up to 30 users control small agents on a shared physical board and contribute to completing a Statue of Peace.

## 2. Core experience

* The phone camera detects a printed board target.
* The AR scene appears on top of the board.
* Each user controls one agent.
* Agents can move, emote, change outfit, and animate.
* A contribute button adds 1% progress to the statue.
* All users see the same shared progress.
* When the statue reaches 100%, the session ends with a completion animation and sound.

## 3. Tech stack

* Frontend: Next.js, React, TypeScript
* AR tracking: MindAR (image target tracking + camera pipeline)
* 3D rendering: Three.js
* Realtime sync: Ably (free tier — managed WebSocket, no server needed)
* Deployment: Vercel (frontend)
* Audio: Web Audio API

## 4. AR setup

* Design a high-contrast image target for the wooden board.
* Track the board with MindAR.
* Anchor the statue at the center.
* Keep all movement within board coordinates.

## 5. Multiplayer model

* One agent per user.
* Ably channel stores:

  * connected users
  * agent positions
  * agent animation state
  * statue progress
  * session status
* Clients simulate movement locally.
* Ably syncs state snapshots only.

## 6. Agent system

Each agent has:

* id
* x, y position
* movement speed
* outfit id
* emotion state
* animation state
* contribution cooldown

Allowed actions:

* move
* idle
* emote
* change outfit
* contribute

## 7. Contribution logic

* User moves agent to the statue area.
* User presses contribute.
* Client verifies range and cooldown locally.
* Statue progress increases by 1% and is published to the Ably channel.
* All clients update immediately.

## 8. UI

* Start camera
* Join session
* Move controls
* Contribute button
* Outfit button
* Emote button
* Progress bar
* Player count
* Short instructions

## 9. Sound

Use only event-based audio:

* move sound: soft and subtle
* contribute sound: short chime
* milestone sound: 25%, 50%, 75%
* completion sound: final harmony tone

## 10. Visual style

* Calm, clean, symbolic
* Low-poly agents
* Peace-themed statue
* Soft motion
* Clear progress feedback

## 11. Performance rules

* Max 30 users
* No heavy AI per frame
* No full physics simulation
* No large crowd rendering
* No continuous audio loops
* Update agent logic at intervals, not every frame

## 12. Build phases

### Phase 1

Board tracking + static statue

### Phase 2

Single-agent control

### Phase 3

Contribution system + progress bar

### Phase 4

Ably multiplayer sync

### Phase 5

Outfits, emotes, and animations

### Phase 6

Sound, polish, and completion flow

## 13. MVP scope

Include only:

* board tracking
* statue
* one agent per user
* movement
* contribute action
* shared progress
* basic audio
* 30-player sync

## 14. Final output

A deployable WebAR web app that turns a physical board into a shared peace-building space where users collaboratively complete a Statue of Peace.
