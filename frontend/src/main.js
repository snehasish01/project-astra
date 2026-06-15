import * as THREE from 'three';
import { createIntro }           from './intro.js';
import { createDecisionCanvas }  from './canvas.js';
import { setupControllers }      from './controller.js';
import { createGazeTracker }     from './gaze.js';
import { sendEvent }             from './socket.js';

// ─── renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// ─── scene ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070d1a);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 0);

scene.add(new THREE.GridHelper(10, 20, 0x1a2744, 0x0f1b35));

// ─── fade state ──────────────────────────────────────────────────────────────
const FADE_MS     = 900;
let   fadeStart   = null;   // timestamp when fade began
let   canvasActive = false; // true once fade completes

// ─── instrumentation state ───────────────────────────────────────────────────
const hoveredCards = new Set(); // cards touched by controller ray at least once

// ─── decision canvas ─────────────────────────────────────────────────────────
let gazeTracker; // declared here, assigned after canvas (needs allCardMeshes)

const canvas = createDecisionCanvas(scene, {
  onBranchOpen(branch) {
    sendEvent('branch_open', { branch });
  },
  onCommit(branch, timeToCommit) {
    const cardStates = canvas.getCardMeshes(branch).map((m, i) => {
      const dwellMs = Math.round(gazeTracker.getTotal(m));
      const skimmed = gazeTracker.isSkimmed(m);
      return { cardIndex: i, title: m.userData.cardTitle, dwellMs, skimmed, controllerHovered: hoveredCards.has(m) };
    });

    // Console report with SKIMMED flags
    const lines = cardStates.map(s =>
      `  [${s.skimmed ? '⚠ SKIMMED' : '✓       '}] card ${s.cardIndex} "${s.title}": ${s.dwellMs}ms | hovered: ${s.controllerHovered}`
    );
    console.log(`[astra] COMMIT → ${branch} | timeToCommit: ${Math.round(timeToCommit)}ms\n${lines.join('\n')}`);

    sendEvent('commit', { branch, timeToCommit: Math.round(timeToCommit), cardStates });
  },
});

// ─── gaze tracker ────────────────────────────────────────────────────────────
gazeTracker = createGazeTracker(camera, canvas.allCardMeshes);

// ─── intro screen ────────────────────────────────────────────────────────────
const intro = createIntro(scene);

// ─── unified select handler ──────────────────────────────────────────────────
function handleSelect(object) {
  const { type } = object.userData;
  if (type === 'begin_exploration') {
    if (!canvasActive && fadeStart === null) {
      // Disable the button immediately to prevent double-fire
      object.visible = false;
      canvas.beginFadeIn();
      fadeStart = null; // will be set in the loop on next frame
      fadeStart = performance.now();
      sendEvent('session_start', {});
    }
  } else if (canvasActive) {
    canvas.onSelect(object);
  }
}

// ─── controllers ─────────────────────────────────────────────────────────────
const allInteractables = [...intro.interactables, ...canvas.interactables];

const { update: updateControllers } = setupControllers(
  renderer, scene,
  allInteractables,
  handleSelect,
  (mesh, isHovering) => {
    if (isHovering && mesh.userData.type === 'card' && !hoveredCards.has(mesh)) {
      hoveredCards.add(mesh);
      sendEvent('card_hover', { branch: mesh.userData.branch, card: mesh.userData.cardIndex });
    }
  },
);

// ─── Enter VR button ─────────────────────────────────────────────────────────
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
  button.textContent = 'WebXR not available';
  button.disabled = true;
} else {
  navigator.xr.isSessionSupported('immersive-vr').then(supported => {
    if (!supported) { button.textContent = 'Immersive VR not supported'; button.disabled = true; }
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── render loop ─────────────────────────────────────────────────────────────
renderer.setAnimationLoop((timestamp) => {
  // Fade transition: intro → canvas
  if (fadeStart !== null) {
    const t = Math.min((timestamp - fadeStart) / FADE_MS, 1);
    intro.setOpacity(1 - t);
    canvas.setHeaderOpacity(t);

    if (t >= 1) {
      intro.hide();
      fadeStart    = null;
      canvasActive = true;
    }
  }

  // Head-gaze dwell tracking (only while canvas is live and in VR)
  if (canvasActive && renderer.xr.isPresenting) {
    gazeTracker.update(timestamp);
  }

  updateControllers();
  renderer.render(scene, camera);
});
