import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ageAtScaleFactor, ageFromSlider, conditions, MIN_SCALE, MIN_YEARS, scaleFactorAtAge, scalePosition, sliderFromAge, thermalRGB, TODAY_YEARS } from '../src/cosmology.ts';
import { parseCatalogue } from '../src/catalog.ts';
import { parseCmb, sampleCmb } from '../src/cmb.ts';
import { buildSkyEvolution, driftTime, particlePosition, particleFluxRatio, KM_S_TO_PC_GYR } from '../src/sky-evolution.ts';

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
test('observed WMAP map has real microwave anisotropy', () => {
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
});
test('force-free 3D particles obey expansion, conserved momentum and inverse-square flux', () => {
  const direction=[.6,0,.8], motion=[0,0,0,500];
  assert.ok(Math.abs(KM_S_TO_PC_GYR-1022.712)<.001);
  for(const a of [MIN_SCALE,.05,.1,.2,.4,.8,1]) {
    const position=particlePosition(direction,motion,a);
    assert.ok(Math.abs(Math.hypot(...position)-500*a)<1e-9);
    assert.ok(Math.abs(position[0]/position[2]-.75)<1e-12,'pure expansion preserves angles');
    assert.ok(Math.abs(particleFluxRatio(direction,motion,a)-a**-2)<1e-5);
  }
  assert.equal(driftTime(1),0);
  const moving=[1.2,-.4,.5,500];
  // Independent finite-difference check of dx/dt=p/a² using the age integral.
  for(const a of [.08,.2,.6,.9]) {
    const step=1e-5;
    const before=particlePosition(direction,moving,a-step).map(v=>v/(a-step));
    const after=particlePosition(direction,moving,a+step).map(v=>v/(a+step));
    const dt=(ageAtScaleFactor(a+step)-ageAtScaleFactor(a-step))/1e9;
    for(let j=0;j<3;j++) {
      const momentum=a*a*(after[j]-before[j])/dt;
      assert.ok(Math.abs(momentum-moving[j])<.004,`canonical momentum: ${momentum}`);
    }
    const distance=Math.hypot(...particlePosition(direction,moving,a));
    assert.ok(Math.abs(particleFluxRatio(direction,moving,a)-(500/distance)**2)<1e-9);
  }
});
test('extended observed catalogue gives more detectable sources when closer and exact Tycho endpoints', () => {
  const raw=gunzipSync(readFileSync(new URL('../public/data/tycho2_mag10.bin.gz',import.meta.url)));
  const catalogue=parseCatalogue(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  const model=buildSkyEvolution(catalogue);
  assert.equal(catalogue.count,329281);
  assert.equal(model.brightCount,120530);
  assert.deepEqual(model,buildSkyEvolution(catalogue));
  let earlyVisible=0,todayVisible=0,drifting=0;
  for(let i=0;i<catalogue.count;i++) {
    const direction=catalogue.positions.subarray(i*3,i*3+3), motion=model.motion.subarray(i*4,i*4+4);
    const early=particlePosition(direction,motion,.4),today=particlePosition(direction,motion,1);
    for(let j=0;j<3;j++) assert.equal(today[j],direction[j]*motion[3]);
    assert.ok(early.every(Number.isFinite));
    const mag=catalogue.magnitudes[i];
    if(mag-2.5*Math.log10(particleFluxRatio(direction,motion,.4))<9)earlyVisible++;
    if(mag<9)todayVisible++;
    const norm=Math.hypot(...early);
    if(early.some((v,j)=>Math.abs(v/norm-direction[j])>.01))drifting++;
  }
  assert.ok(earlyVisible>todayVisible*2.5,'actual distance brightening reveals faint sources');
  assert.ok(drifting>catalogue.count*.2,'relative motion creates projected drift');
  assert.ok(model.births.every(t=>t>=150 && t<=550));
});
