export type Catalogue = { count: number; positions: Float32Array; magnitudes: Float32Array; colours: Float32Array };
export function parseCatalogue(buffer: ArrayBuffer): Catalogue {
  const view = new DataView(buffer);
  if (buffer.byteLength < 16 || new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== 'WISCAT1\0') throw new Error('Invalid Tycho catalogue header');
  const count = view.getUint32(8, true), stride = view.getUint32(12, true);
  if (stride !== 3 || count === 0 || buffer.byteLength !== 16 + count * stride * 4) throw new Error('Invalid Tycho catalogue length');
  const positions = new Float32Array(count * 3), colours = new Float32Array(count * 3), magnitudes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const offset = 16 + i * 12;
    const raHours = view.getFloat32(offset, true), decDegrees = view.getFloat32(offset + 4, true), mag = view.getFloat32(offset + 8, true);
    if (![raHours, decDegrees, mag].every(Number.isFinite) || raHours < 0 || raHours > 24 || Math.abs(decDegrees) > 90) throw new Error('Invalid star in Tycho catalogue');
    const ra = raHours * Math.PI / 12, dec = decDegrees * Math.PI / 180;
    positions.set([Math.cos(dec) * Math.cos(ra), Math.sin(dec), Math.cos(dec) * Math.sin(ra)], i * 3);
    magnitudes[i] = mag;
    // Stable decorative hues. The AIDA subset contains no measured B_T colours.
    const hue = (Math.sin(ra * 97.31 + dec * 17.13) + 1) / 2;
    colours.set(hue < 0.18 ? [1, 0.76, 0.50] : hue > 0.73 ? [0.68, 0.80, 1] : [0.95, 0.94, 0.88], i * 3);
  }
  return { count, positions, magnitudes, colours };
}
export async function loadCatalogue(): Promise<Catalogue> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/tycho2_mag8.bin.gz`);
  if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  // Some servers transparently decompress .gz files; support both forms.
  const raw = new Uint8Array(bytes);
  const buffer = raw[0] === 0x1f && raw[1] === 0x8b
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : bytes;
  return parseCatalogue(buffer);
}
