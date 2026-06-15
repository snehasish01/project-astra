import * as THREE from 'three';

const COUNT = 200;

export function createEnvironment(scene) {
  // ── Lights ───────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x0d1a33, 1.2));

  const blue = new THREE.PointLight(0x1a4a8a, 1.8, 10);
  blue.position.set(-3, 3, -3);
  scene.add(blue);

  const amber = new THREE.PointLight(0x3d2000, 1.0, 7);
  amber.position.set(3, 1.5, -1);
  scene.add(amber);

  const topFill = new THREE.PointLight(0x0a1f44, 0.6, 12);
  topFill.position.set(0, 5, -2);
  scene.add(topFill);

  // ── Particles ─────────────────────────────────────────────────────────────────
  const positions  = new Float32Array(COUNT * 3);
  const velocities = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 7;
    positions[i * 3 + 1] = Math.random() * 3.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5;
    velocities[i * 3]     = (Math.random() - 0.5) * 0.0025;
    velocities[i * 3 + 1] = Math.random() * 0.0018 + 0.0005;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.0015;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const particles = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x2a4d7a,
    size: 0.012,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
  }));
  scene.add(particles);

  // Slow blue pulse on the key light
  let t = 0;

  function update() {
    t += 0.008;
    blue.intensity = 1.5 + Math.sin(t) * 0.3;

    const pos = geo.attributes.position;
    for (let i = 0; i < COUNT; i++) {
      pos.array[i * 3]     += velocities[i * 3];
      pos.array[i * 3 + 1] += velocities[i * 3 + 1];
      pos.array[i * 3 + 2] += velocities[i * 3 + 2];

      if (pos.array[i * 3 + 1] > 4)    pos.array[i * 3 + 1] = 0;
      if (Math.abs(pos.array[i * 3]) > 4)  velocities[i * 3] *= -1;
      if (Math.abs(pos.array[i * 3 + 2]) > 3) velocities[i * 3 + 2] *= -1;
    }
    pos.needsUpdate = true;
  }

  return { update };
}

// ── Web Audio ambient sound ───────────────────────────────────────────────────

let _ctx = null;

export function startAmbientSound() {
  if (_ctx) return;
  try {
    _ctx = new AudioContext();

    const master = _ctx.createGain();
    master.gain.setValueAtTime(0, _ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.9, _ctx.currentTime + 3);
    master.connect(_ctx.destination);

    // Low-frequency drone (two detuned oscillators for thickness)
    for (const [freq, vol] of [[48, 0.05], [51, 0.03]]) {
      const osc = _ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = _ctx.createGain();
      g.gain.value = vol;
      osc.connect(g);
      g.connect(master);
      osc.start();
    }

    // Filtered noise shimmer
    const buf = _ctx.createBuffer(1, _ctx.sampleRate * 3, _ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const noise = _ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.4;

    const ng = _ctx.createGain();
    ng.gain.value = 0.006;

    noise.connect(bp); bp.connect(ng); ng.connect(master);
    noise.start();
  } catch (_) { /* AudioContext blocked — silently skip */ }
}
