export const H0 = 67.4;
export const OMEGA_M = 0.315;
export const OMEGA_R = 0.000092;
export const OMEGA_L = 1 - OMEGA_M - OMEGA_R;
export const T0 = 2.7255;
const HUBBLE_YEARS = 3.0856775814913673e19 / H0 / (365.25 * 86400);
const MIN_A = 1e-8;
const TABLE_SIZE = 12000;
const table: { a: number; years: number }[] = [];
// Integrate dt/d(ln a) = 1/H(a). Radiation gives a finite initial age.
const dtDLogA = (a: number) => HUBBLE_YEARS / Math.sqrt(OMEGA_R / a ** 4 + OMEGA_M / a ** 3 + OMEGA_L);
let years = HUBBLE_YEARS * MIN_A ** 2 / (2 * Math.sqrt(OMEGA_R));
let prev = MIN_A;
for (let i = 0; i <= TABLE_SIZE; i++) {
  const a = Math.exp(Math.log(MIN_A) * (1 - i / TABLE_SIZE));
  if (i) years += (dtDLogA(prev) + dtDLogA(a)) / 2 * Math.log(a / prev);
  table.push({ a, years });
  prev = a;
}
export const TODAY_YEARS = table[table.length - 1].years;
export const MIN_YEARS = 380000;

export function scaleFactorAtAge(age: number): number {
  if (!Number.isFinite(age) || age <= 0) throw new RangeError('Age must be positive and finite');
  if (age >= TODAY_YEARS) return 1;
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].years < age) lo = mid;
    else hi = mid;
  }
  const fraction = (age - table[lo].years) / (table[hi].years - table[lo].years);
  return Math.max(MIN_A, table[lo].a + fraction * (table[hi].a - table[lo].a));
}
export function ageAtScaleFactor(a: number): number {
  if (!Number.isFinite(a) || a <= 0 || a > 1) throw new RangeError('Scale factor must be finite and in (0, 1]');
  if (a === 1) return TODAY_YEARS;
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].a < a) lo = mid;
    else hi = mid;
  }
  const fraction = (a - table[lo].a) / (table[hi].a - table[lo].a);
  return table[lo].years + fraction * (table[hi].years - table[lo].years);
}
export const MIN_SCALE = scaleFactorAtAge(MIN_YEARS);
export const scalePosition = (a: number) => (a - MIN_SCALE) / (1 - MIN_SCALE) * 100;
export const ageFromSlider = (value: number) => MIN_YEARS * (TODAY_YEARS / MIN_YEARS) ** (Math.max(0, Math.min(1000, value)) / 1000);
export const sliderFromAge = (age: number) => Math.log(age / MIN_YEARS) / Math.log(TODAY_YEARS / MIN_YEARS) * 1000;
export const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
export function conditions(age: number) {
  const a = scaleFactorAtAge(age);
  return { a, temperature: T0 / a, redshift: 1 / a - 1, density: a ** -3, flux: a ** -2, population: smoothstep(150e6, 600e6, age), peakMeters: 2.897771955e-3 * a / T0 };
}
// Spectral radiance at three representative visible wavelengths, divided by
// the 550nm radiance of a 3000K blackbody. This is a colour approximation,
// not a calibrated retina/display response. Numerical ratios avoid overflow.
export function thermalRGB(temperature: number): [number, number, number] {
  const c2 = 0.01438776877;
  const ref = Math.expm1(c2 / (550e-9 * 3000));
  return [650e-9, 550e-9, 450e-9].map(lambda => {
    const exponent = c2 / (lambda * temperature);
    return exponent > 700 ? 0 : (550e-9 / lambda) ** 5 * ref / Math.expm1(exponent);
  }) as [number, number, number];
}
export function formatAge(age: number): { value: string; unit: string } {
  if (age >= 1e9) return { value: (age / 1e9).toFixed(age >= 10e9 ? 1 : 2), unit: 'billion years' };
  if (age >= 1e6) return { value: (age / 1e6).toFixed(age >= 100e6 ? 0 : 1), unit: 'million years' };
  return { value: Math.round(age).toLocaleString('en-US'), unit: 'years' };
}
export const epochs = [
  { name: 'Recombination', short: '380k years', age: MIN_YEARS, title: 'The first light escapes.', description: 'The universe becomes transparent. A hot, nearly uniform thermal glow fills every direction; stars have yet to form.' },
  { name: 'Dark ages', short: '10m years', age: 10e6, title: 'A sky without stars.', description: 'The primordial glow cools out of visible light. Hydrogen fills a universe waiting for its first stars.' },
  { name: 'First stars', short: '300m years', age: 300e6, title: 'Darkness gives way.', description: 'The first stellar populations begin to illuminate the cosmos. The simulation switches luminous tracers on at assumed formation times.' },
  { name: 'Reionization', short: '800m years', age: 800e6, title: 'Islands of light.', description: 'Young stars and galaxies reshape their surroundings. Closer simulated sources are brighter; more faint catalogue stars become detectable.' },
  { name: 'Cosmic noon', short: '3b years', age: 3e9, title: 'A universe in bloom.', description: 'Galaxies are vigorously forming stars. A smaller scale factor brings the model’s sources closer and brightens their light.' },
  { name: 'Today', short: '13.8b years', age: TODAY_YEARS, title: 'The sky we know.', description: '120,530 Tycho-2 stars at their measured sky positions. A 2.73 K background. The view from a hypothetical planet today.' },
];
