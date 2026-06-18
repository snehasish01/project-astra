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

// A minor pentatonic across three octaves for atmospheric note selection
const PENTATONIC = [
  110.00, 130.81, 146.83, 164.81, 196.00,  // A2 C3 D3 E3 G3
  220.00, 261.63, 293.66, 329.63, 392.00,  // A3 C4 D4 E4 G4
  440.00, 523.25, 587.33, 659.25, 784.00,  // A4 C5 D5 E5 G5
];

// Procedural convolution reverb — exponentially decaying stereo noise burst
function buildReverb(ctx, duration) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

// Looped 4-second white-noise buffer
function buildNoise(ctx) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true; src.start();
  return src;
}

// Sine LFO connected to an AudioParam (output added to param's base value)
function makeLfo(ctx, rate, depth, target) {
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = rate;
  const dep = ctx.createGain();
  dep.gain.value = depth;
  lfo.connect(dep); dep.connect(target);
  lfo.start();
}

// One pentatonic note: slow linear attack → hold → exponential release
function playNote(ctx, freq, bus) {
  const now     = ctx.currentTime;
  const attack  = 1.5  + Math.random() * 2.0;
  const hold    = 1.0  + Math.random() * 3.0;
  const release = 4.0  + Math.random() * 4.0;
  const vol     = 0.028 + Math.random() * 0.028;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.detune.value    = (Math.random() - 0.5) * 10;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(vol,    now + attack);
  env.gain.setValueAtTime(vol,             now + attack + hold);
  env.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release);

  osc.connect(env); env.connect(bus);
  osc.start(now);
  osc.stop(now + attack + hold + release + 0.2);
}

// Recursive random melody scheduler — biases toward mid-range for musicality
function scheduleMelody(ctx, bus) {
  if (ctx.state === 'closed') return;
  setTimeout(() => {
    if (ctx.state === 'closed') return;
    const raw = Math.pow(Math.random(), 0.65) * PENTATONIC.length;
    playNote(ctx, PENTATONIC[Math.min(Math.floor(raw), PENTATONIC.length - 1)], bus);
    scheduleMelody(ctx, bus);
  }, 6000 + Math.random() * 10000); // 6–16 s between notes
}

export function startAmbientSound() {
  if (_ctx) return;
  try {
    _ctx = new AudioContext();

    // Master — 4-second fade-in so entry is imperceptible
    const master = _ctx.createGain();
    master.gain.setValueAtTime(0, _ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.85, _ctx.currentTime + 4);
    master.connect(_ctx.destination);

    // Reverb send (3.5 s convolution tail)
    const reverb  = buildReverb(_ctx, 3.5);
    const revSend = _ctx.createGain();
    revSend.gain.value = 0.38;
    reverb.connect(revSend); revSend.connect(master);

    // ── Low drone — 4 detuned triangle/sine oscillators through swept LPF ────────
    const droneGain = _ctx.createGain();
    droneGain.gain.value = 0.055;

    const droneLpf = _ctx.createBiquadFilter();
    droneLpf.type = 'lowpass'; droneLpf.frequency.value = 220; droneLpf.Q.value = 1.1;
    makeLfo(_ctx, 0.033, 65,    droneLpf.frequency); // slow cutoff sweep 155–285 Hz
    makeLfo(_ctx, 0.065, 0.012, droneGain.gain);     // slow amplitude wobble

    droneGain.connect(droneLpf); droneLpf.connect(master);

    for (const [freq, rel] of [[62, 1.0], [63.8, 0.75], [65.5, 0.50], [124, 0.25]]) {
      const osc = _ctx.createOscillator();
      osc.type = freq > 100 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const g = _ctx.createGain(); g.gain.value = rel;
      osc.connect(g); g.connect(droneGain); osc.start();
    }

    // ── Sub rumble — 36 Hz, more felt than heard ──────────────────────────────────
    const sub  = _ctx.createOscillator();
    sub.type = 'sine'; sub.frequency.value = 36;
    const subG = _ctx.createGain(); subG.gain.value = 0.022;
    sub.connect(subG); subG.connect(master); sub.start();

    // ── Shimmer noise — bandpass ~3.5 kHz with slow amplitude swell ───────────────
    const noiseSrc = buildNoise(_ctx);
    const shimBp   = _ctx.createBiquadFilter();
    shimBp.type = 'bandpass'; shimBp.frequency.value = 3500; shimBp.Q.value = 2.2;
    const shimGain = _ctx.createGain(); shimGain.gain.value = 0.013;
    makeLfo(_ctx, 0.11, 0.005, shimGain.gain);
    noiseSrc.connect(shimBp); shimBp.connect(shimGain); shimGain.connect(master);

    // ── High-frequency air — 4 sine tones > 2 kHz, each with independent LFO ─────
    for (const [freq, vol, rate] of [
      [2093, 0.0026, 0.027],
      [2349, 0.0019, 0.041],
      [2637, 0.0021, 0.019],
      [3136, 0.0015, 0.053],
    ]) {
      const osc = _ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq;
      const g = _ctx.createGain(); g.gain.value = vol;
      makeLfo(_ctx, rate, vol * 0.65, g.gain);
      osc.connect(g); g.connect(master); osc.start();
    }

    // ── Pentatonic melody — all-wet through reverb for maximum spatial depth ──────
    const melodyBus = _ctx.createGain(); melodyBus.gain.value = 1.0;
    melodyBus.connect(reverb);
    scheduleMelody(_ctx, melodyBus);

  } catch (_) { /* AudioContext blocked or unsupported — silently skip */ }
}
