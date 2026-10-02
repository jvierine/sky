import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ageAtScaleFactor, ageFromSlider, conditions, MIN_SCALE, MIN_YEARS, scaleFactorAtAge, scalePosition, sliderFromAge, thermalRGB, TODAY_YEARS } from '../src/cosmology.ts';
import { parseCatalogue } from '../src/catalog.ts';
import { parseCmb, sampleCmb } from '../src/cmb.ts';
import { buildStructure } from '../src/structure.ts';
import { angularSpread, buildSkyEvolution, evolvedDirection, PATCH_COUNT } from '../src/sky-evolution.ts';

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
test('the secondary Gyr axis inverts expansion on a linear scale-factor slider', () => {
  assert.equal(scalePosition(MIN_SCALE), 0);
  assert.equal(scalePosition(1), 100);
  assert.equal(ageAtScaleFactor(1), TODAY_YEARS);
  for(const a of [MIN_SCALE, 0.01, 0.1, 0.2, 0.4, 0.6, 0.8, 1]) {
    assert.ok(Math.abs(scaleFactorAtAge(ageAtScaleFactor(a))-a)<1e-10);
  }
  assert.ok(ageAtScaleFactor(0.5)<TODAY_YEARS/2);
  assert.throws(()=>ageAtScaleFactor(0),RangeError);
});
test('actual AIDA catalogue is valid, includes bright stars, and lies on a unit sphere', () => {
  const bytes = gunzipSync(readFileSync(new URL('../public/data/tycho2_mag9.bin.gz', import.meta.url)));
  const catalogue = parseCatalogue(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.equal(catalogue.count,120530);
  assert.ok(catalogue.magnitudes.filter(m=>m>=8 && m<9).length>75000);
  assert.ok(catalogue.magnitudes.reduce((a,b)=>Math.min(a,b),Infinity)<-1);
  assert.ok(catalogue.magnitudes.reduce((a,b)=>Math.max(a,b),-Infinity)<9);
  for(let i=0;i<catalogue.count;i++) {
    assert.ok(Math.abs(Math.hypot(...catalogue.positions.subarray(i*3,i*3+3))-1)<1e-6);
  }
  assert.throws(()=>parseCatalogue(new ArrayBuffer(0)),/header/);
  assert.throws(()=>parseCatalogue(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength-1)),/length/);
});
test('observed WMAP map has real anisotropy and seeds reproducible finite clusters', () => {
  const data=gunzipSync(readFileSync(new URL('../public/data/wmap9.bin.gz',import.meta.url)));
  const map=parseCmb(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
  assert.equal(map.width,1024);
  assert.equal(map.height,512);
  let sum=0,sumSquared=0;
  for(const pixel of map.pixels){const t=(pixel/255*2-1)*200;sum+=t;sumSquared+=t*t;}
  const rms=Math.sqrt(sumSquared/map.pixels.length-(sum/map.pixels.length)**2);
  assert.ok(rms>40 && rms<100);
  const directions=[[1,0,0],[0,1,0],[0,0,1],[-1,0,0]];
  assert.ok(new Set(directions.map(direction=>sampleCmb(map,direction))).size>2);
  const catalogue={count:4,positions:new Float32Array(directions.flat()),magnitudes:new Float32Array([1,2,3,4]),colours:new Float32Array(12)};
  const first=buildStructure(catalogue,map),second=buildStructure(catalogue,map);
  assert.equal(first.centres.length,32);
  assert.deepEqual(first.targets,second.targets);
  assert.ok(first.targets.every(Number.isFinite));
  assert.ok(first.depths.every(n=>n>0 && n<6));
});
test('all-sky birth patches separate continuously and end at the exact Tycho vectors', () => {
  const data=gunzipSync(readFileSync(new URL('../public/data/wmap9.bin.gz',import.meta.url)));
  const cmb=parseCmb(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
  const raw=gunzipSync(readFileSync(new URL('../public/data/tycho2_mag9.bin.gz',import.meta.url)));
  const catalogue=parseCatalogue(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  const evolution=buildSkyEvolution(catalogue,cmb);
  assert.equal(evolution.centres.length,PATCH_COUNT*3);
  const occupancy=new Set(evolution.patches);
  assert.ok(occupancy.size>PATCH_COUNT*0.9,'birth patches must surround the observer');
  const pairs=new Map<number,number[]>();
  for(let i=0;i<catalogue.count;i++){
    const patch=evolution.patches[i],pair=pairs.get(patch)??[];
    if(pair.length<2)pair.push(i);
    pairs.set(patch,pair);
  }
  const angle=(p:number[],q:number[])=>Math.atan2(Math.hypot(p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]),p.reduce((s,v,j)=>s+v*q[j],0));
  for(const pair of pairs.values()) {
    if(pair.length<2)continue;
    let last=-1;
    for(const a of [0.05,0.2,0.4,0.7,1]) {
      const directions=pair.map(i=>evolvedDirection(evolution.seeds.subarray(i*3,i*3+3),catalogue.positions.subarray(i*3,i*3+3),a,evolution.exponents[evolution.patches[i]]));
      const separation=angle(directions[0],directions[1]);
      assert.ok(separation>=last-1e-5,'neighbouring stars must separate as a grows');
      last=separation;
    }
  }
  for(let i=0;i<catalogue.count;i+=131){
    const final=catalogue.positions.subarray(i*3,i*3+3);
    assert.deepEqual(evolvedDirection(evolution.seeds.subarray(i*3,i*3+3),final,1),Array.from(final));
    const direction=evolvedDirection(evolution.seeds.subarray(i*3,i*3+3),final,.4);
    assert.ok(Math.abs(Math.hypot(...direction)-1)<1e-4);
  }
  assert.ok(evolution.births.every(t=>t>=150 && t<=550));
  assert.equal(angularSpread(1),1);
});
