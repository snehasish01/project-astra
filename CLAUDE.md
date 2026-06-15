# Project ASTRA

WebXR proof-of-concept for Meta Quest 3S. A VR decision canvas with branching trade-off cards, head-gaze dwell tracking, and a WebSocket backend that fires "cognitive dissonance" prompts back into the scene.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + Three.js (WebXR) |
| Backend | Node.js + `ws` library |
| Target device | Meta Quest 3S browser (Chromium-based) |
| Transport | WebSocket (ws://) |

No framework, no bundler plugins beyond Vite defaults, no ORM, no database.

## Project Structure

```
project-astra/
├── frontend/
│   ├── index.html          # Entry point; must include WebXR polyfill check
│   ├── vite.config.js      # Minimal config; HTTPS required for WebXR on Quest
│   └── src/
│       ├── main.js         # Scene bootstrap, WebXR session init
│       ├── scene.js        # Three.js scene, camera, renderer setup
│       ├── canvas.js       # Decision canvas: three branch groups + cards
│       ├── gaze.js         # Head-gaze raycaster (camera forward vector)
│       ├── dwell.js        # Dwell timer logic per card
│       ├── controller.js   # XRInputSource handling (select event → commit)
│       └── socket.js       # WebSocket client, event serialization
├── backend/
│   ├── server.js           # Node.js WS server, event router, prompt logic
│   └── prompts.js          # Cognitive dissonance prompt strings keyed by branch
├── package.json            # Root; workspaces or separate per-layer
└── CLAUDE.md
```

## Scene Layout

- **Three branches**: `Upskill`, `Pivot`, `Automate` — arranged in a shallow arc in front of the user at comfortable arm's length (~1.5 m).
- **Three cards per branch**: each branch has three trade-off cards (e.g., cost, time, risk). Cards are `PlaneGeometry` meshes with `MeshBasicMaterial` (no lighting needed for PoC).
- **Commit button**: one per branch, below its card stack. Triggering it via controller select or sufficient dwell sends a `commit` event to the backend.
- **Prompt overlay**: a flat `Sprite` or `PlaneGeometry` that appears in the user's forward view when the backend fires a dissonance prompt.

## Head-Gaze Raycasting

Quest 3S has no eye tracking. Gaze is approximated by casting a ray from the XR camera position along its forward vector (`camera.getWorldDirection`).

```js
// gaze.js — core pattern
const raycaster = new THREE.Raycaster();
const forward = new THREE.Vector3();

function updateGaze(camera, interactables) {
  camera.getWorldDirection(forward);
  raycaster.set(camera.position, forward);
  return raycaster.intersectObjects(interactables, false);
}
```

- Run `updateGaze` every frame in the XR render loop (`renderer.setAnimationLoop`).
- Interactable objects are registered in a flat array; no scene-graph traversal.
- Intersection threshold: first hit only, `distance < 3.0` meters.

## Dwell Timer

- Each card tracks `dwellStart` (timestamp) and `dwellAccumulated` (ms).
- Dwell increments only while the card is the top intersection hit.
- Threshold: **2000 ms** triggers a `dwell_complete` event.
- Dwell resets if gaze leaves the card before threshold.
- No dwell on the commit button — commit requires explicit controller `select`.

## WebSocket Events

All messages are JSON. Frontend → Backend:

```jsonc
// gaze entered a card
{ "type": "gaze_enter", "branch": "Upskill", "card": 1, "ts": 1718000000000 }

// gaze left a card
{ "type": "gaze_exit", "branch": "Upskill", "card": 1, "dwellMs": 800, "ts": 1718000000800 }

// dwell threshold reached
{ "type": "dwell_complete", "branch": "Upskill", "card": 1, "ts": 1718000002000 }

// user pressed commit for a branch
{ "type": "commit", "branch": "Pivot", "ts": 1718000010000 }
```

Backend → Frontend:

```jsonc
// fire a cognitive dissonance prompt
{ "type": "prompt", "branch": "Pivot", "text": "Are you sure? Pivoting rarely preserves existing expertise.", "ts": 1718000010050 }
```

## Backend Logic (`server.js`)

- Listens on `ws://localhost:8080`.
- Maintains per-session state: which cards have been dwelled, which branch was committed.
- Fires a `prompt` message when:
  1. A `commit` is received, OR
  2. All three cards in a branch have reached `dwell_complete` (user has read everything).
- `prompts.js` exports a map: `{ Upskill: [...], Pivot: [...], Automate: [...] }`. Pick by index or randomly.
- No persistence; state is in-memory per WebSocket connection.

## WebXR Session Setup

```js
// main.js — session request pattern
const button = document.getElementById('enter-vr');
button.addEventListener('click', () => {
  navigator.xr.requestSession('immersive-vr', {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['bounded-floor'],
  }).then(onSessionStarted);
});
```

- Use `renderer.xr.enabled = true` and `renderer.xr.setSession(session)`.
- Frame loop: `renderer.setAnimationLoop(render)` — do not use `requestAnimationFrame` in XR mode.
- Camera is managed by Three.js XR; do not manually set `camera.position` inside the loop.

## HTTPS Requirement

WebXR requires a secure context. For local dev targeting the Quest 3S:

1. Run Vite with `--https` (uses `@vitejs/plugin-basic-ssl` or a local cert).
2. Find your dev machine's LAN IP.
3. Open `https://<LAN-IP>:5173` in the Quest browser and accept the self-signed cert.
4. The backend WS server runs plain `ws://` on port 8080. **The frontend must connect to `ws://192.168.6.154:8080`** — `ws://localhost:8080` resolves to the headset itself, not the Mac.

## Key Constraints

- **No eye tracking on Quest 3S.** Head-gaze only. Do not reference `XRSystem` eye-tracking features.
- **No external UI frameworks.** All UI is Three.js geometry and textures; no HTML overlays in XR mode.
- **Minimal dependencies.** Frontend: `three`, `vite`. Backend: `ws`. Nothing else without explicit approval.
- **No database.** All state is in-memory for this PoC.
- **One WebSocket connection per session.** No reconnect logic needed for PoC.

## Development Commands

```bash
# Frontend
cd frontend && npm run dev          # Vite dev server (add --https flag)

# Backend
cd backend && node server.js        # WS server on port 8080
```

## Coding Conventions

- ES modules throughout (`import`/`export`); no CommonJS in frontend.
- Backend uses CommonJS (`require`) unless `"type": "module"` is set in its `package.json`.
- No TypeScript for this PoC.
- Three.js objects created once and mutated in the render loop — avoid `new THREE.*` inside `setAnimationLoop`.
- Event constants live in a shared `events.js` (or inline strings if trivial).
