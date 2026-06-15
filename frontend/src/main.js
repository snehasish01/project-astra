import * as THREE from 'three';

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d1a);

// Camera — XR will override position/orientation once in session
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 0);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(2, 4, 2);
scene.add(sun);

// Reference cube — placed 2 m in front at eye height
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.4, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x4fc3f7 })
);
cube.position.set(0, 1.6, -2);
scene.add(cube);

// Floor grid for spatial grounding
const grid = new THREE.GridHelper(10, 20, 0x333355, 0x222244);
scene.add(grid);

// Enter VR button
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
      session.addEventListener('end', () => {
        button.style.display = '';
      });
    })
    .catch(err => console.error('XR session error:', err));
});

// Disable button if WebXR unavailable
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

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Render loop — setAnimationLoop is required for WebXR
renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.005;
  renderer.render(scene, camera);
});
