import * as THREE from 'three';
import { createDecisionCanvas } from './canvas.js';
import { setupControllers } from './controller.js';

// ─── renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// ─── scene ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070d1a);

// Camera — XR overrides position/orientation once a session is active
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 0);

// Subtle floor grid for spatial grounding
scene.add(new THREE.GridHelper(10, 20, 0x1a2744, 0x0f1b35));

// ─── decision canvas + controllers ──────────────────────────────────────────
const { interactables, onSelect } = createDecisionCanvas(scene);
const { update: updateControllers } = setupControllers(renderer, scene, interactables, onSelect);

// ─── enter VR button ─────────────────────────────────────────────────────────
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
    if (!supported) {
      button.textContent = 'Immersive VR not supported';
      button.disabled = true;
    }
  });
}

// ─── resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── render loop ─────────────────────────────────────────────────────────────
renderer.setAnimationLoop(() => {
  updateControllers();
  renderer.render(scene, camera);
});
