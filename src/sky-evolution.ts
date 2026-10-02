import type { Catalogue } from './catalog';
import { H0, MIN_SCALE, OMEGA_L, OMEGA_M, OMEGA_R } from './cosmology';

// Free particles in an expanding FLRW background: r=a*x, p=a² dx/dt.
// No mutual gravity: canonical momentum p stays constant. Integrate the
// drift operator ∫dt/a², rather than interpolating screen-space directions.
const HUBBLE_GYR = 3.0856775814913673e19 / H0 / (365.25 * 86400) / 1e9;
export const KM_S_TO_PC_GYR = 365.25 * 86400 * 1e9 / 3.0856775814913673e13;
export const VELOCITY_DISPERSION_KM_S = 0.002;
const STEPS = 8192;
const logMin = Math.log(MIN_SCALE);
const drift = new Float64Array(STEPS + 1);
const integrand = (a: number) => HUBBLE_GYR / Math.sqrt(OMEGA_R + OMEGA_M * a + OMEGA_L * a ** 4);
for (let i = STEPS - 1; i >= 0; i--) {
  const a = Math.exp(logMin * (1 - i / STEPS));
  const b = Math.exp(logMin * (1 - (i + 1) / STEPS));
  drift[i] = drift[i + 1] + (integrand(a) + integrand(b)) / 2 * Math.log(b / a);
}
export function driftTime(a: number): number {
  if (!Number.isFinite(a) || a < MIN_SCALE || a > 1) throw new RangeError('Scale outside simulation range');
  if (a === 1) return 0;
  const index = (1 - Math.log(a) / logMin) * STEPS;
  const lo = Math.min(STEPS - 1, Math.max(0, Math.floor(index))), f = index - lo;
  return drift[lo] * (1 - f) + drift[lo + 1] * f;
}
export type ParticleModel = { motion: Float32Array; births: Float32Array; brightCount: number };
export function buildSkyEvolution(catalogue: Catalogue): ParticleModel {
  let state = 0x1234abcd;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state + 0.5) / 4294967296; };
  const gaussian = () => Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  const motion = new Float32Array(catalogue.count * 4), births = new Float32Array(catalogue.count);
  let brightCount = 0;
  for (let i = 0; i < catalogue.count; i++) {
    // These are explicit model priors, NOT Tycho parallaxes/proper motions.
    // Log-uniform 100–1500pc distances. Intrinsic luminosity is then calibrated
    // to the measured apparent magnitude at that assumed present-day distance.
    const distance = 100 * 15 ** random();
    const sigma = VELOCITY_DISPERSION_KM_S * KM_S_TO_PC_GYR;
    motion.set([gaussian() * sigma, gaussian() * sigma, gaussian() * sigma, distance], i * 4);
    births[i] = 150 + 400 * random();
    if (catalogue.magnitudes[i] < 9) brightCount++;
  }
  return { motion, births, brightCount };
}
export function particlePosition(direction: ArrayLike<number>, motion: ArrayLike<number>, a: number, moving = true): number[] {
  const elapsed = moving ? driftTime(a) : 0;
  return [0, 1, 2].map(j => a * (direction[j] * motion[3] - motion[j] * elapsed));
}
export function particleFluxRatio(direction: ArrayLike<number>, motion: ArrayLike<number>, a: number, moving = true): number {
  const position = particlePosition(direction, motion, a, moving);
  return motion[3] ** 2 / position.reduce((s, x) => s + x * x, 0);
}
