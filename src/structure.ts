import type { Catalogue } from './catalog';
import { sampleCmb, type CmbMap } from './cmb';
export function buildStructure(catalogue: Catalogue, map: CmbMap) {
  const candidates = Array.from({length:3072},(_,i)=>{
    const y=1-2*(i+0.5)/3072, phi=i*Math.PI*(3-Math.sqrt(5));
    const direction=[Math.sqrt(1-y*y)*Math.cos(phi),y,Math.sqrt(1-y*y)*Math.sin(phi)];
    return {direction,temperature:sampleCmb(map,direction)};
  }).sort((a,b)=>b.temperature-a.temperature);
  const directions: number[][]=[];
  for(const candidate of candidates) {
    if(directions.every(direction=>direction.reduce((s,v,j)=>s+v*candidate.direction[j],0)<0.94)) directions.push(candidate.direction);
    if(directions.length===32) break;
  }
  // Hot angular patches are only a repeatable visual seed, not a density
  // reconstruction or a claim that these patches formed these galaxies.
  const centres=directions.map((direction,i)=>direction.map(n=>n*(3.0+(i%7)/7*1.7)));
  const targets=new Float32Array(catalogue.count*3), temperatures=new Float32Array(catalogue.count), depths=new Float32Array(catalogue.count);
  for(let i=0;i<catalogue.count;i++) {
    const direction=Array.from(catalogue.positions.subarray(i*3,i*3+3));
    temperatures[i]=sampleCmb(map,direction);
    const hash=Math.sin(i*91.713+catalogue.magnitudes[i]*7.11)*43758.5453;
    depths[i]=5.8*Math.cbrt(0.04+0.96*(hash-Math.floor(hash)));
    let nearest=0,best=-Infinity;
    for(let j=0;j<directions.length;j++) {
      const dot=direction.reduce((sum,n,k)=>sum+n*directions[j][k],0);
      if(dot>best){nearest=j;best=dot;}
    }
    const scatter=0.25+0.55*(hash-Math.floor(hash));
    // Tycho directions select a group; individual depths and offsets are synthetic.
    targets.set(direction.map((n,j)=>{
      const noise=Math.sin(i*43.13+j*71.91)*951.73;
      return centres[nearest][j]+(0.2*n+noise-Math.floor(noise)-0.5)*scatter*2;
    }),i*3);
  }
  return {centres,targets,temperatures,depths};
}
