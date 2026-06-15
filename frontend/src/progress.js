import * as THREE from 'three';

const TOTAL    = 9;
const SIZE     = 0.20;   // world metres
const DIST_FWD = 0.80;   // metres forward from camera
const DIST_DN  = 0.32;   // metres below camera

const _fwd = new THREE.Vector3();
const _up  = new THREE.Vector3(0, 1, 0);

export function createProgressRing(scene, camera) {
  const cv  = document.createElement('canvas');
  cv.width  = 512;
  cv.height = 512;
  const tex = new THREE.CanvasTexture(cv);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  mesh.renderOrder = 999;
  mesh.visible = false;   // shown after intro fade
  scene.add(mesh);

  let engaged = 0;
  const engagedSet = new Set();  // tracks which card keys have been counted

  function redraw() {
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const cx = w / 2, cy = h / 2, R = 210;

    ctx.clearRect(0, 0, w, h);

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 20;
    ctx.stroke();

    // Progress arc (clockwise from top)
    if (engaged > 0) {
      const pct  = engaged / TOTAL;
      const end  = -Math.PI / 2 + Math.PI * 2 * pct;
      const hue  = Math.round(200 + 40 * pct);        // blue → cyan as it fills
      const sat  = Math.round(70 + 30 * pct);
      const lite = Math.round(50 + 20 * pct);
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, end);
      ctx.strokeStyle = `hsla(${hue},${sat}%,${lite}%,${0.45 + 0.45 * pct})`;
      ctx.lineWidth = 24;
      ctx.lineCap   = 'round';
      ctx.stroke();

      // Glow pass
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, end);
      ctx.strokeStyle = `hsla(${hue},100%,80%,${0.15 * pct})`;
      ctx.lineWidth = 38;
      ctx.stroke();
    }

    // Centre counter
    const alpha = 0.25 + 0.65 * (engaged / TOTAL);
    ctx.fillStyle = `rgba(180,220,255,${alpha})`;
    ctx.font = 'bold 110px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${engaged}`, cx, cy - 20);

    ctx.font = '46px system-ui, sans-serif';
    ctx.fillStyle = `rgba(140,180,220,${alpha * 0.7})`;
    ctx.fillText(`/ ${TOTAL}`, cx, cy + 65);

    tex.needsUpdate = true;
  }

  redraw();

  function onEngaged(cardKey) {
    if (engagedSet.has(cardKey)) return;
    engagedSet.add(cardKey);
    engaged++;
    redraw();
  }

  function show() { mesh.visible = true; }

  function update() {
    if (!mesh.visible) return;
    camera.getWorldDirection(_fwd);
    mesh.position
      .copy(camera.position)
      .addScaledVector(_fwd, DIST_FWD)
      .addScaledVector(_up, -DIST_DN);
    mesh.quaternion.copy(camera.quaternion);
  }

  return { onEngaged, show, update };
}
