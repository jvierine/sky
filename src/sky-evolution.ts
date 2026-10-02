import type { Catalogue } from './catalog';
import { sampleCmb, type CmbMap } from './cmb';

export const PATCH_COUNT = 1536;
export const angularSpread = (a: number) => 0.12 + 0.88 * Math.max(0, Math.min(1, a));

// A phenomenological angular model, not a prediction of cosmological expansion.
// Patch centres cover the observer's entire sphere. Local angular offsets fan
// out with a, and the exact measured Tycho vectors are the endpoint constraint.
export function buildSkyEvolution(catalogue: Catalogue, cmb: CmbMap) {
  const centres = new Float32Array(PATCH_COUNT * 3);
  const exponents = new Float32Array(PATCH_COUNT);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < PATCH_COUNT; i++) {
    const y = 1 - 2 * (i + 0.5) / PATCH_COUNT, phi = i * goldenAngle;
    const radius = Math.sqrt(1 - y * y);
    const direction = [radius * Math.cos(phi), y, radius * Math.sin(phi)];
    // Observed WMAP variations gently displace the evenly spread scaffolding.
    // Their sign is a visual seed, not an inferred local density or birth time.
    const tangent = [-Math.sin(phi), 0, Math.cos(phi)];
    const meridian = [-y*Math.cos(phi),radius,-y*Math.sin(phi)];
    const temperature=sampleCmb(cmb,direction);
    const noise=Math.sin(i*31.17)*7171.19, second=Math.sin(i*73.31)*3181.7;
    const shift = (temperature - 0.5) * 0.025 + (noise-Math.floor(noise)-0.5)*0.05;
    const north = (second-Math.floor(second)-0.5)*0.05;
    const vector = direction.map((v, j) => v + tangent[j] * shift+meridian[j]*north);
    const norm = Math.hypot(...vector);
    centres.set(vector.map(v => v / norm), i * 3);
    exponents[i]=0.3+1.2*(0.5*temperature+0.5*(noise-Math.floor(noise)));
  }
  const seeds = new Float32Array(catalogue.count * 3);
  const motion = new Float32Array(catalogue.count * 4);
  const patches = new Uint16Array(catalogue.count);
  const births = new Float32Array(catalogue.count);
  for (let i = 0; i < catalogue.count; i++) {
    const x = catalogue.positions[i * 3], y = catalogue.positions[i * 3 + 1], z = catalogue.positions[i * 3 + 2];
    let best = -2, nearest = 0;
    for (let j = 0; j < PATCH_COUNT; j++) {
      const dot = x * centres[j * 3] + y * centres[j * 3 + 1] + z * centres[j * 3 + 2];
      if (dot > best) { best = dot; nearest = j; }
    }
    patches[i] = nearest;
    seeds.set(centres.subarray(nearest * 3, nearest * 3 + 3), i * 3);
    motion.set([...centres.subarray(nearest*3,nearest*3+3),exponents[nearest]],i*4);
    const noise = Math.sin(i * 79.17 + nearest * 13.41) * 17371.13;
    const patchNoise = Math.sin(nearest * 19.13) * 71.31;
    // Distributed individual births, 150–550 Myr, with a 50 Myr fade-in.
    births[i] = 150 + 300 * (noise - Math.floor(noise)) + 100 * (patchNoise - Math.floor(patchNoise));
  }
  return { seeds, motion, patches, births, centres, exponents };
}

export function evolvedDirection(seed: ArrayLike<number>, final: ArrayLike<number>, a: number, exponent=1): number[] {
  if (a >= 1) return Array.from(final);
  const sn=Math.hypot(seed[0],seed[1],seed[2]), fn=Math.hypot(final[0],final[1],final[2]);
  const s=[0,1,2].map(j=>seed[j]/sn), f=[0,1,2].map(j=>final[j]/fn);
  const dot = Math.max(-1, Math.min(1, s[0]*f[0]+s[1]*f[1]+s[2]*f[2]));
  const sine=Math.hypot(s[1]*f[2]-s[2]*f[1],s[2]*f[0]-s[0]*f[2],s[0]*f[1]-s[1]*f[0]);
  const theta=Math.atan2(sine,dot), spread=angularSpread(a**exponent);
  if (sine < 1e-10) return f;
  return [0, 1, 2].map(j => s[j] * Math.cos(theta * spread) + (f[j] - s[j] * dot) / sine * Math.sin(theta * spread));
}
