# AR Detection & Lighting Hint Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase Hiro marker detection reliability under variable lighting, and surface a contextual hint to the user when detection stalls for more than 3 seconds after a successful prior lock.

**Architecture:** All changes in `public/ar.html` only. Two independent changes: (1) tune the `arjs` A-Frame component attribute for higher detection rate, (2) add a lightweight timer in the existing inline `<script>` block that updates the hint pill text on prolonged `markerLost`.

**Tech Stack:** A-Frame 1.6.0, AR.js 3.4.5, vanilla JS, existing DOM elements (`#hint-pill`).

---

## File Map

| File | Changes |
|---|---|
| `public/ar.html` | Line 74: add `maxDetectionRate: 60` to `arjs` attribute. Script block: replace bare `marker.addEventListener` calls with timer-aware versions |

---

### Task 1: Increase AR.js detection rate

**Files:**
- Modify: `public/ar.html` (line 74, the `arjs` attribute on `<a-scene>`)

**Context:** AR.js defaults to ~30 detection attempts per second. Raising to 60 means the marker pattern is checked every ~16 ms instead of ~33 ms, halving the window where a brief lighting shift causes a missed frame. There is a small CPU cost on mobile; 60 is well within budget for modern phones.

- [ ] **Step 1: Add maxDetectionRate to arjs attribute**

Find line 74 in `public/ar.html`:
```html
    arjs="sourceType: webcam; detectionMode: mono; trackingMethod: best; sourceWidth: 1280; sourceHeight: 720; debugUIEnabled: false"
```
Replace with:
```html
    arjs="sourceType: webcam; detectionMode: mono; trackingMethod: best; sourceWidth: 1280; sourceHeight: 720; debugUIEnabled: false; maxDetectionRate: 60"
```

- [ ] **Step 2: Commit**

```bash
git add public/ar.html
git commit -m "fix(ar): raise maxDetectionRate to 60 for more robust marker detection"
```

---

### Task 2: Smart lighting hint on prolonged markerLost

**Files:**
- Modify: `public/ar.html` (inline `<script>` block, lines ~218–220)

**Context:** Currently `markerLost` immediately calls `setScanning()` which shows "scanning" in the status pill but leaves the bottom hint as "point camera at hiro marker". If the user already knows where the marker is but is in bad lighting, this gives no actionable guidance. After 3 s of `markerLost` (only when the marker was found at least once this session), the hint updates to "try better lighting · flatten the marker". It resets on `markerFound`.

- [ ] **Step 1: Replace bare markerFound/markerLost listeners**

Find at the bottom of the inline `<script>` block (around lines 218–219):
```javascript
      marker.addEventListener('markerFound', setLocked);
      marker.addEventListener('markerLost', setScanning);
```
Replace with:
```javascript
      var markerEverFound  = false;
      var lightingHintTimer = null;

      marker.addEventListener('markerFound', function () {
        markerEverFound = true;
        if (lightingHintTimer) {
          clearTimeout(lightingHintTimer);
          lightingHintTimer = null;
        }
        // Reset hint text so next scan phase shows the default message
        hintPill.textContent = 'point camera at hiro marker';
        setLocked(); // setLocked() hides hintPill; text is ready for next markerLost→setScanning cycle
      });

      marker.addEventListener('markerLost', function () {
        setScanning();
        if (!markerEverFound) { return; }
        lightingHintTimer = setTimeout(function () {
          hintPill.textContent = 'try better lighting · flatten the marker';
        }, 3000);
      });
```

- [ ] **Step 2: Verify `hintPill` is already declared in scope**

Confirm line ~127 in `public/ar.html` contains:
```javascript
      const hintPill   = document.getElementById('hint-pill');
```
If it does — no change needed. The variable is already in scope for the new listeners.

- [ ] **Step 3: Commit**

```bash
git add public/ar.html
git commit -m "feat(ar): show lighting hint after 3 s of marker loss to guide user recovery"
```
