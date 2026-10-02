import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ageFromSlider, conditions, MIN_YEARS, scaleFactorAtAge, sliderFromAge, thermalRGB, TODAY_YEARS } from '../src/cosmology.ts';
import { parseCatalogue } from '../src/catalog.ts';

test('Friedmann integration agrees with present age and recombination', () => {
  assert.ok(TODAY_YEARS > 13.7e9 && TODAY_YEARS < 13.9e9, String(TODAY_YEARS));
  assert.equal(scaleFactorAtAge(TODAY_YEARS), 1);
  const recombination = conditions(MIN_YEARS);
  assert.ok(recombination.redshift > 1050 && recombination.redshift < 1150);
  assert.ok(recombination.temperature > 2850 && recombination.temperature < 3150);
  assert.equal(recombination.population, 0);
  assert.equal(conditions(TODAY_YEARS).flux, 1);
  assert.equal(conditions(TODAY_YEARS).density, 1);
  assert.throws(() => scaleFactorAtAge(NaN), RangeError);
});
test('time conversion is invertible and expansion is monotonic', () => {
  let previous = 0;
  for(let i=0;i<=1000;i++) {
    const age = ageFromSlider(i), a = scaleFactorAtAge(age);
    assert.ok(a > previous);
    assert.ok(Math.abs(sliderFromAge(age)-i)<1e-8);
    previous=a;
  }
});
test('thermal glow is visible at recombination and absent in the dark ages', () => {
  const first = thermalRGB(conditions(MIN_YEARS).temperature);
  const dark = thermalRGB(conditions(10e6).temperature);
  assert.ok(first[0]>first[1] && first[1]>first[2]);
  assert.ok(first[0]>1);
  assert.ok(dark.every(n=>n<1e-12));
  assert.ok(thermalRGB(2.7255).every(n=>n===0));
  assert.equal(conditions(100e6).population,0);
  assert.equal(conditions(800e6).population,1);
  assert.ok(conditions(300e6).population>0 && conditions(300e6).population<1);
});
test('actual AIDA catalogue is valid, includes bright stars, and lies on a unit sphere', () => {
  const bytes = gunzipSync(readFileSync(new URL('../public/data/tycho2_mag8.bin.gz', import.meta.url)));
  const catalogue = parseCatalogue(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.equal(catalogue.count,42072);
  assert.ok(Math.min(...catalogue.magnitudes)<-1);
  assert.ok(Math.max(...catalogue.magnitudes)<8);
  for(let i=0;i<catalogue.count;i++) {
    assert.ok(Math.abs(Math.hypot(...catalogue.positions.subarray(i*3,i*3+3))-1)<1e-6);
  }
  assert.throws(()=>parseCatalogue(new ArrayBuffer(0)),/header/);
  assert.throws(()=>parseCatalogue(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength-1)),/length/);
});
