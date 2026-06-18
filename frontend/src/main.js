import * as THREE from 'three';
import { createIntro }                        from './intro.js';
import { createDecisionCanvas, BRANCHES }     from './canvas.js';
import { setupControllers }                   from './controller.js';
import { createGazeTracker }                  from './gaze.js';
import { createEnvironment, startAmbientSound } from './environment.js';
import { createProgressRing }                 from './progress.js';
import { createCompare }                      from './compare.js';
import { createDecisionEcho }                 from './echo.js';
import { createAcdCard }                      from './acd_card.js';
import { createLockRings }                    from './lock_ring.js';
import { sendEvent, onServerMessage }         from './socket.js';

// ── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b18);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 0);

scene.add(new THREE.GridHelper(10, 20, 0x111d33, 0x0a1526));

// ── Environment ───────────────────────────────────────────────────────────────
const env = createEnvironment(scene);

// ── State ─────────────────────────────────────────────────────────────────────
const FADE_MS      = 900;
let   fadeStart    = null;
let   canvasActive = false;
let   compareOpen  = false;
let   echoOpen     = false;
let   acdOpen      = false;

let pendingCommitBranch  = null;  // set during commit flow
let acdFallbackTimer     = null;  // 4 s: proceed to echo if no ACD arrives
let lockedBranch         = null;  // branch whose COMMIT button is locked
let postAcdActionFired   = false; // guard against duplicate post_acd_action logs

// Tracks which branches already fired commit_intent this session (once per branch)
const commitIntentFired = new Set();

// Tracks which cards the controller has hovered (for instrumentation)
const hoveredCards = new Set();

// ── Instrumentation ───────────────────────────────────────────────────────────
let gazeTracker;

// ── Proceed to Decision Echo ──────────────────────────────────────────────────
function proceedWithCommit(branch) {
  clearTimeout(acdFallbackTimer);
  acdFallbackTimer = null;
  pendingCommitBranch = branch;
  echo.show(branch);
  echoOpen = true;
  sendEvent('decision_echo_shown', { branch });
}

// ── Decision canvas ───────────────────────────────────────────────────────────
const canvas = createDecisionCanvas(scene, {
  onBranchOpen(branch) {
    sendEvent('branch_open', { branch });
  },
  onCommit(branch, timeToCommit) {
    sendEvent('commit', { branch, timeToCommit: Math.round(timeToCommit) });
    // Wait up to 4 s for ACD trigger; if none arrives, proceed to echo card
    acdFallbackTimer = setTimeout(() => {
      if (!echoOpen && !acdOpen) proceedWithCommit(branch);
    }, 4000);
  },
  onLayerViewed(branch, cardIndex, layer) {
    const layerName = ['surface', 'evidence', 'personal'][layer];
    sendEvent('card_layer_viewed', { branch, card: cardIndex, layer: layerName });
    if (layer >= 1) progress.onEngaged(`${branch}-${cardIndex}`);
  },
  onCompare() {
    compareOpen = true;
    compare.show();
    sendEvent('comparison_opened', {});
  },
});

// ── Gaze tracker ──────────────────────────────────────────────────────────────
gazeTracker = createGazeTracker(camera, canvas.allCardMeshes);

// ── Intro ─────────────────────────────────────────────────────────────────────
const intro = createIntro(scene);

// ── Progress ring ─────────────────────────────────────────────────────────────
const progress = createProgressRing(scene, camera);

// ── Comparison panel ──────────────────────────────────────────────────────────
const compare = createCompare(scene, BRANCHES);

// ── Decision echo card ────────────────────────────────────────────────────────
const echo = createDecisionEcho(scene);

// ── ACD intervention card ─────────────────────────────────────────────────────
const acd = createAcdCard(scene, camera);

// ── Commit lock rings (one per branch, overlays the COMMIT button) ────────────
const lockRings = createLockRings(scene);

// ── Server-push: ACD trigger ──────────────────────────────────────────────────
onServerMessage(msg => {
  if (msg.type !== 'acd_trigger') return;
  if (echoOpen) return;  // already past the commit gate

  clearTimeout(acdFallbackTimer);
  acdFallbackTimer = null;

  acdOpen            = true;
  postAcdActionFired = false;

  const { question, pattern, branch, referencedCard, referencedBranch } = msg;
  console.log(`[astra] ACD (${pattern}): "${question}" [${referencedBranch} › ${referencedCard}]`);

  // Layer 4: lock the Commit button for 4 s while card materialises
  lockedBranch = branch;
  sendEvent('acd_lock_started', { branch, pattern });

  lockRings.start(branch, 4000, () => {
    // Lock expires — release commit button
    lockedBranch = null;
    sendEvent('acd_lock_released', { branch });

    // If user hasn't interacted with the ACD card yet, log explored_more
    if (acdOpen && !postAcdActionFired) {
      postAcdActionFired = true;
      sendEvent('post_acd_action', { action: 'explored_more', branch, pattern });
    }
  });

  sendEvent('acd_shown', { branch, pattern, referencedCard, referencedBranch, question });

  acd.show(
    question,
    // Reconsider — return to canvas without proceeding
    () => {
      acd.hide();
      acdOpen = false;
      if (!postAcdActionFired) {
        postAcdActionFired = true;
        sendEvent('post_acd_action', { action: 'reconsider', branch, pattern, referencedCard });
        sendEvent('acd_response',    { response: 'reconsider', branch, pattern, referencedCard });
      }
    },
    // Commit Anyway — proceed to Decision Echo
    () => {
      acd.hide();
      acdOpen = false;
      if (!postAcdActionFired) {
        postAcdActionFired = true;
        sendEvent('post_acd_action', { action: 'commit', branch, pattern, referencedCard });
        sendEvent('acd_response',    { response: 'commit_anyway', branch, pattern, referencedCard });
      }
      proceedWithCommit(branch);
    },
  );
});

// ── Select handler ────────────────────────────────────────────────────────────
function handleSelect(object) {
  const { type, branch } = object.userData;

  // ACD card has exclusive focus while visible
  if (acdOpen) {
    acd.onSelect(object);
    return;
  }

  if (type === 'begin_exploration' && !canvasActive && fadeStart === null) {
    object.visible = false;
    canvas.beginFadeIn();
    fadeStart = performance.now();
    startAmbientSound();
    sendEvent('session_start', {});
    return;
  }

  if (type === 'compare_close') {
    compare.hide(); compareOpen = false; return;
  }

  if (type === 'echo_confirm') {
    const b = echo.getBranch();
    const cardStates = canvas.getCardMeshes(b).map((m, i) => ({
      cardIndex:         i,
      title:             m.userData.cardTitle,
      dwellMs:           Math.round(gazeTracker.getTotal(m)),
      skimmed:           gazeTracker.isSkimmed(m) && m.userData.maxLayer === 0,
      maxLayer:          ['surface', 'evidence', 'personal'][m.userData.maxLayer],
      controllerHovered: hoveredCards.has(m),
    }));
    sendEvent('decision_confirmed', { branch: b, cardStates });
    echo.hide(); echoOpen = false; pendingCommitBranch = null;
    return;
  }

  if (type === 'echo_reconsider') {
    echo.hide(); echoOpen = false; pendingCommitBranch = null; return;
  }

  if (canvasActive && !echoOpen) {
    // Block commits while that branch's COMMIT button is locked
    if (type === 'commit' && lockedBranch === branch) return;
    canvas.onSelect(object);
  }
}

// ── Controllers & hover ───────────────────────────────────────────────────────
const allInteractables = [
  ...intro.interactables,
  ...canvas.interactables,
  ...compare.interactables,
  ...echo.interactables,
  ...acd.interactables,
];

const { update: updateControllers } = setupControllers(
  renderer, scene,
  allInteractables,
  handleSelect,
  (mesh, isHovering) => {
    if (!isHovering) return;

    // Card hover instrumentation
    if (mesh.userData.type === 'card' && !hoveredCards.has(mesh)) {
      hoveredCards.add(mesh);
      sendEvent('card_hover', { branch: mesh.userData.branch, card: mesh.userData.cardIndex });
    }

    // commit_intent: fires once per branch, the first time the ray touches COMMIT
    if (mesh.userData.type === 'commit') {
      const b = mesh.userData.branch;
      if (!commitIntentFired.has(b)) {
        commitIntentFired.add(b);
        sendEvent('commit_intent', { branch: b });
      }
    }
  },
);

// ── Enter VR button ───────────────────────────────────────────────────────────
const button = document.getElementById('enter-vr');
button.addEventListener('click', () => {
  navigator.xr
    .requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor'],
    })
    .then(session => {
      renderer.xr.setSession(session);
      button.style.display = 'none';
      session.addEventListener('end', () => { button.style.display = ''; });
    })
    .catch(err => console.error('XR session error:', err));
});

if (!navigator.xr) {
  button.textContent = 'WebXR not available'; button.disabled = true;
} else {
  navigator.xr.isSessionSupported('immersive-vr').then(s => {
    if (!s) { button.textContent = 'Immersive VR not supported'; button.disabled = true; }
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render loop ───────────────────────────────────────────────────────────────
renderer.setAnimationLoop((timestamp) => {
  env.update();

  // Fade: intro → canvas
  if (fadeStart !== null) {
    const t = Math.min((timestamp - fadeStart) / FADE_MS, 1);
    intro.setOpacity(1 - t);
    canvas.setHeaderOpacity(t);
    if (t >= 1) {
      intro.hide();
      progress.show();
      fadeStart    = null;
      canvasActive = true;
    }
  }

  // Head-gaze + progress ring (XR only)
  if (canvasActive && renderer.xr.isPresenting) {
    gazeTracker.update(timestamp);
    progress.update();
  }

  // ACD card follows camera; lock ring sweeps to completion
  acd.update();
  lockRings.update();

  updateControllers();
  renderer.render(scene, camera);
});
