export type CmbMap = { width: number; height: number; pixels: Uint8Array };
export function parseCmb(buffer: ArrayBuffer): CmbMap {
  if (buffer.byteLength<16 || new TextDecoder().decode(new Uint8Array(buffer,0,8))!=='WMAPCMB1') throw new Error('Invalid WMAP map header');
  const view=new DataView(buffer), width=view.getUint32(8,true), height=view.getUint32(12,true);
  if(width!==1024 || height!==512 || buffer.byteLength!==16+width*height) throw new Error('Invalid WMAP map dimensions');
  return {width,height,pixels:new Uint8Array(buffer,16)};
}
export async function loadCmb(): Promise<CmbMap> {
  const response=await fetch(`${import.meta.env.BASE_URL}data/wmap9.bin.gz`);
  if(!response.ok) throw new Error(`WMAP map request failed (${response.status})`);
  const bytes=await response.arrayBuffer(), raw=new Uint8Array(bytes);
  const buffer=raw[0]===0x1f && raw[1]===0x8b ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : bytes;
  return parseCmb(buffer);
}
// IAU J2000 equatorial -> Galactic rotation, with app vector order (x,z,y).
export function sampleCmb(map: CmbMap, position: number[]): number {
  const [x,z,y]=position;
  const gx=-0.0548755604*x-0.8734370902*y-0.4838350155*z;
  const gy=0.4941094279*x-0.4448296300*y+0.7469822445*z;
  const gz=-0.8676661490*x-0.1980763734*y+0.4559837762*z;
  const length=Math.hypot(gx,gy,gz);
  let phi=Math.atan2(gy,gx); if(phi<0) phi+=Math.PI*2;
  const theta=Math.acos(Math.max(-1,Math.min(1,gz/length)));
  const col=Math.floor(phi/(Math.PI*2)*map.width)%map.width, row=Math.min(map.height-1,Math.floor(theta/Math.PI*map.height));
  return map.pixels[row*map.width+col]/255;
}
