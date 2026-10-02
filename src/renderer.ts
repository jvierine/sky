import type { Catalogue } from './catalog';
import { conditions, smoothstep, thermalRGB } from './cosmology';
import type { CmbMap } from './cmb';
import { buildStructure } from './structure';
import { buildSkyEvolution } from './sky-evolution';

const starVertex = `
attribute vec3 a_position;
attribute float a_magnitude;
attribute vec3 a_colour;
attribute float a_depth;
attribute vec3 a_target;
attribute float a_cmb;
attribute vec4 a_skySeed;
attribute float a_birth;
uniform vec3 u_right, u_up, u_forward;
uniform float u_aspect, u_tanFov, u_pixelRatio, u_flux, u_population;
uniform float u_spatial, u_scale, u_cameraDistance, u_formation, u_seedCloud;
uniform float u_timeMyr, u_evolve;
varying vec3 v_colour;
varying float v_brightness;
void main() {
  vec3 initial = a_position*a_depth*0.45;
  vec3 formed = a_target*u_scale;
  vec3 seed=normalize(a_skySeed.xyz), final=normalize(a_position);
  float cosine=clamp(dot(seed,final),-1.0,1.0);
  float sine=length(cross(seed,final)), theta=atan(sine,cosine);
  vec3 tangent=(final-seed*cosine)/max(sine,0.000001);
  float spread=0.12+0.88*pow(u_scale,a_skySeed.w);
  vec3 skyPosition=seed*cos(theta*spread)+tangent*sin(theta*spread);
  // Use the catalogue vector directly at today's endpoint, without rounding
  // through spherical interpolation or any synthetic cluster transformation.
  if(u_scale>=1.0 || sine<0.000001) skyPosition=a_position;
  vec3 position = mix(skyPosition,mix(initial,formed,u_formation),u_spatial);
  float z = dot(position, u_forward) + u_spatial*u_cameraDistance;
  gl_Position = vec4(dot(position,u_right)/u_tanFov/u_aspect, dot(position,u_up)/u_tanFov, z-0.001, z);
  float flux = pow(10.0, -0.4*(a_magnitude-5.0)) * u_flux;
  float born=mix(1.0,smoothstep(a_birth,a_birth+50.0,u_timeMyr),u_evolve);
  float skySize=mix(1.2,clamp(1.4+3.1*pow(flux,0.25),1.5,mix(4.0,16.0,u_scale)),born);
  float spatialSize=mix(1.2,clamp(0.65+0.65*pow(flux,0.25),0.9,2.8),u_population);
  gl_PointSize=mix(skySize,spatialSize,u_spatial)*u_pixelRatio;
  vec3 cloudColour=mix(vec3(0.15,0.55,1.0),vec3(1.0,0.40,0.12),a_cmb);
  float cloud=(1.0-u_formation)*u_seedCloud*mix(0.025,0.035,u_spatial);
  float starlight=(1.0-exp(-flux*0.95))*mix(born,u_population,u_spatial)*mix(1.0,0.045,u_spatial);
  v_colour=mix(cloudColour,a_colour,starlight/max(0.00001,starlight+cloud));
  v_brightness=starlight+cloud;
  if (z <= 0.01 || v_brightness <= 0.0) gl_Position = vec4(2.0,2.0,2.0,1.0);
}`;
const galaxyVertex = `
attribute vec3 a_position, a_initial, a_colour;
attribute float a_seed;
uniform vec3 u_right, u_up, u_forward;
uniform float u_aspect, u_tanFov, u_pixelRatio, u_scale, u_cameraDistance, u_population, u_exposure, u_formation;
varying vec3 v_colour;
varying float v_seed, v_opacity;
void main() {
  vec3 position = mix(a_initial*0.45,a_position*u_scale,u_formation);
  float z = dot(position,u_forward)+u_cameraDistance;
  gl_Position=vec4(dot(position,u_right)/u_tanFov/u_aspect,dot(position,u_up)/u_tanFov,z-0.001,z);
  gl_PointSize=clamp((120.0+85.0*a_seed)/max(z,0.1)/u_tanFov,3.0,70.0)*u_pixelRatio;
  v_colour=a_colour;
  v_seed=a_seed;
  v_opacity=u_population*(1.0-exp(-u_exposure*1.3));
  if(z<=0.01) gl_Position=vec4(2.0,2.0,2.0,1.0);
}`;
const galaxyFragment = `
precision mediump float;
varying vec3 v_colour;
varying float v_seed, v_opacity;
void main() {
  vec2 p=gl_PointCoord*2.0-1.0;
  float angle=v_seed*6.283185;
  vec2 q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
  q.y /= 0.35+0.6*v_seed;
  float r=length(q);
  if(r>1.0) discard;
  float disc=exp(-r*r*12.0);
  float core=exp(-r*r*95.0);
  vec3 colour=mix(v_colour,vec3(1.0,0.93,0.76),core);
  gl_FragColor=vec4(colour,(disc*0.75+core*0.6)*v_opacity);
}`;
const starFragment = `
precision mediump float;
varying vec3 v_colour;
varying float v_brightness;
void main() {
  vec2 p = gl_PointCoord*2.0-1.0;
  float r2 = dot(p,p);
  if(r2>1.0) discard;
  float core = exp(-r2*15.0);
  float halo = 0.16*exp(-r2*4.0);
  gl_FragColor = vec4(v_colour, (core+halo)*v_brightness);
}`;
const bgVertex = `
attribute vec2 a_position;
varying vec2 v_uv;
void main(){ v_uv=a_position; gl_Position=vec4(a_position,0.0,1.0); }
`;
const bgFragment = `
precision highp float;
varying vec2 v_uv;
uniform vec3 u_thermal, u_right, u_up, u_forward;
uniform float u_aspect, u_tanFov, u_grid;
uniform sampler2D u_cmb;
uniform float u_cmbOpacity;
vec3 cmbColour(float t) {
  vec3 cold=vec3(0.06,0.20,0.64), mid=vec3(0.80,0.88,0.67), hot=vec3(0.81,0.12,0.06);
  return t<0.5 ? mix(cold,mid,t*2.0) : mix(mid,hot,(t-0.5)*2.0);
}
void main() {
  vec3 colour = vec3(0.006,0.009,0.016) + (vec3(1.0)-exp(-u_thermal*0.42));
  vec3 ray = normalize(u_forward + v_uv.x*u_tanFov*u_aspect*u_right + v_uv.y*u_tanFov*u_up);
  if(u_cmbOpacity>0.0) {
    vec3 equatorial=vec3(ray.x,ray.z,ray.y);
    vec3 galactic=vec3(dot(equatorial,vec3(-0.0548755604,-0.8734370902,-0.4838350155)),dot(equatorial,vec3(0.4941094279,-0.4448296300,0.7469822445)),dot(equatorial,vec3(-0.8676661490,-0.1980763734,0.4559837762)));
    float phi=atan(galactic.y,galactic.x);
    vec2 uv=vec2(fract(phi/6.283185+1.0),acos(clamp(galactic.z,-1.0,1.0))/3.141593);
    colour=mix(colour,cmbColour(texture2D(u_cmb,uv).r)*0.76,u_cmbOpacity);
  }
  if (u_grid>0.5) {
    float ra = atan(ray.z,ray.x);
    float dec = asin(ray.y);
    float meridian = 1.0-smoothstep(0.008,0.02,abs(sin(ra*12.0)));
    float parallel = 1.0-smoothstep(0.008,0.02,abs(sin(dec*12.0)));
    colour += vec3(0.11,0.21,0.23)*max(meridian,parallel)*0.4;
  }
  gl_FragColor=vec4(colour,1.0);
}`;
type Program = { program: WebGLProgram; uniform: (name: string) => WebGLUniformLocation | null };
export class SkyRenderer {
  readonly gl: WebGLRenderingContext;
  private stars: Program;
  private background: Program;
  private galaxies: Program;
  private galaxyBuffers: WebGLBuffer[];
  private cmbTexture: WebGLTexture;
  private cmb?: CmbMap;
  readonly galaxyCount = 900;
  private catalogue?: Catalogue;
  private buffers: WebGLBuffer[] = [];
  private triangle: WebGLBuffer;
  yaw = 1.4;
  pitch = 0.12;
  fov = 80;
  mode: 'space' | 'sky' = 'sky';
  cameraDistance = 10;
  dragging = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private keys = new Set<string>();
  private events = new AbortController();
  get hasActiveKeys() { return this.keys.size > 0; }
  onViewChange = () => {};
  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL is unavailable. Enable hardware acceleration or try another browser.');
    this.gl = gl;
    this.stars = this.program(starVertex, starFragment);
    this.background = this.program(bgVertex, bgFragment);
    this.galaxies = this.program(galaxyVertex, galaxyFragment);
    this.cmbTexture=gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D,this.cmbTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,1,1,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,new Uint8Array([128]));
    // Deterministic illustrative galaxy groups, independent of the Tycho data.
    let seed = 1731;
    const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
    const sphere = (radius: number) => {
      const azimuth = random()*Math.PI*2, z = random()*2-1, r = radius*Math.cbrt(random());
      return [r*Math.sqrt(1-z*z)*Math.cos(azimuth), r*z, r*Math.sqrt(1-z*z)*Math.sin(azimuth)];
    };
    const centres = Array.from({length:32},()=>sphere(4.8));
    const positions = new Float32Array(this.galaxyCount*3), colours = new Float32Array(this.galaxyCount*3), seeds = new Float32Array(this.galaxyCount);
    for(let i=0;i<this.galaxyCount;i++) {
      const centre=centres[i%centres.length], offset=sphere(0.85);
      positions.set(centre.map((n,j)=>n+offset[j]),i*3);
      const colour=random();
      colours.set(colour<0.35?[1,0.65,0.35]:colour>0.75?[0.66,0.58,1]:[0.46,0.77,1],i*3);
      seeds[i]=random();
    }
    this.galaxyBuffers=[this.buffer(positions),this.buffer(colours),this.buffer(seeds),this.buffer(positions)];
    this.triangle = this.buffer(new Float32Array([-1,-1,3,-1,-1,3]));
    const options = { signal: this.events.signal };
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
      this.pinchDistance = this.getPinchDistance();
    }, options);
    canvas.addEventListener('pointermove', e => {
      const last = this.pointers.get(e.pointerId);
      if (!last) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size > 1) {
        const distance = this.getPinchDistance();
        if (this.pinchDistance > 0) {
          if(this.mode==='space') this.cameraDistance=Math.max(7,Math.min(22,this.cameraDistance*this.pinchDistance/distance));
          else this.fov = Math.max(25, Math.min(110, this.fov * this.pinchDistance / distance));
        }
        this.pinchDistance = distance;
      } else {
        const sensitivity = this.fov / 80 * 0.003;
        this.yaw -= (e.clientX - last.x) * sensitivity;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (e.clientY-last.y)*sensitivity));
      }
      this.onViewChange();
    }, options);
    const release = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.dragging = this.pointers.size > 0;
      this.pinchDistance = this.getPinchDistance();
    };
    canvas.addEventListener('pointerup', release, options);
    canvas.addEventListener('pointercancel', release, options);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if(this.mode==='space') this.cameraDistance=Math.max(7,Math.min(22,this.cameraDistance+e.deltaY*0.01));
      else this.fov = Math.max(25, Math.min(110, this.fov + e.deltaY * 0.035));
      this.onViewChange();
    }, { passive: false, ...options });
    canvas.addEventListener('keydown', e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-','='].includes(e.key)) { e.preventDefault(); this.keys.add(e.key); }
    }, options);
    canvas.addEventListener('keyup', e => this.keys.delete(e.key), options);
    canvas.addEventListener('blur', () => this.keys.clear(), options);
  }
  dispose() {
    this.events.abort();
    for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
    for (const buffer of this.galaxyBuffers) this.gl.deleteBuffer(buffer);
    this.gl.deleteBuffer(this.triangle);
    this.gl.deleteProgram(this.stars.program);
    this.gl.deleteProgram(this.background.program);
    this.gl.deleteProgram(this.galaxies.program);
    this.gl.deleteTexture(this.cmbTexture);
  }
  private getPinchDistance() {
    const points = [...this.pointers.values()];
    return points.length < 2 ? 0 : Math.max(1, Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y));
  }
  private program(vertex: string, fragment: string): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(kind)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'WebGL program failed');
    return { program, uniform: name => gl.getUniformLocation(program, name) };
  }
  private buffer(data: Float32Array) {
    const buffer = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
    return buffer;
  }
  private attribute(program: Program, name: string, buffer: WebGLBuffer, size: number) {
    const gl = this.gl, location = gl.getAttribLocation(program.program, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
  setCatalogue(catalogue: Catalogue, cmb: CmbMap) {
    this.catalogue = catalogue;
    this.cmb=cmb;
    for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
    const structure=buildStructure(catalogue,cmb);
    const sky=buildSkyEvolution(catalogue,cmb);
    this.buffers = [this.buffer(catalogue.positions), this.buffer(catalogue.magnitudes), this.buffer(catalogue.colours),this.buffer(structure.depths),this.buffer(structure.targets),this.buffer(structure.temperatures),this.buffer(sky.motion),this.buffer(sky.births)];
    const positions=new Float32Array(this.galaxyCount*3);
    for(let i=0;i<this.galaxyCount;i++) {
      const centre=structure.centres[i%structure.centres.length];
      positions.set(centre.map((n,j)=>n+Math.sin(i*17.71+j*2.31)*0.7),i*3);
    }
    this.gl.deleteBuffer(this.galaxyBuffers[0]);
    this.galaxyBuffers[0]=this.buffer(positions);
    const gl=this.gl;
    gl.bindTexture(gl.TEXTURE_2D,this.cmbTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,cmb.width,cmb.height,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,cmb.pixels);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  setMode(mode: 'space' | 'sky') { this.mode=mode; this.reset(); }
  reset() { this.yaw = 1.4; this.pitch = 0.12; this.fov = this.mode==='space'?60:80; this.cameraDistance=10; this.onViewChange(); }
  render(age: number, exposure: number, population: boolean, background: boolean, grid: boolean, delta: number, showCmb=true) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    if (this.keys.size) {
      const velocity = Math.min(delta, 0.05) * 0.65;
      this.yaw += (Number(this.keys.has('ArrowRight'))-Number(this.keys.has('ArrowLeft'))) * velocity;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (Number(this.keys.has('ArrowUp'))-Number(this.keys.has('ArrowDown'))) * velocity));
      const zoomDirection=Number(this.keys.has('-'))-Number(this.keys.has('+') || this.keys.has('='));
      if(this.mode==='space') this.cameraDistance=Math.max(7,Math.min(22,this.cameraDistance+zoomDirection*velocity*7));
      else this.fov = Math.max(25, Math.min(110, this.fov + zoomDirection * velocity * 35));
      this.onViewChange();
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.canvas.clientWidth * ratio), height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0,0,width,height);
    const forward = [Math.cos(this.pitch)*Math.cos(this.yaw), Math.sin(this.pitch), Math.cos(this.pitch)*Math.sin(this.yaw)];
    const right = [-Math.sin(this.yaw),0,Math.cos(this.yaw)];
    const up = [-Math.sin(this.pitch)*Math.cos(this.yaw),Math.cos(this.pitch),-Math.sin(this.pitch)*Math.sin(this.yaw)];
    const state = conditions(age), ev = 2 ** exposure, spatial = this.mode==='space';
    const formation=smoothstep(30e6,1.3e9,age);
    const common = (p: Program) => {
      gl.useProgram(p.program);
      gl.uniform3fv(p.uniform('u_forward'), forward);
      gl.uniform3fv(p.uniform('u_right'), right);
      gl.uniform3fv(p.uniform('u_up'), up);
      gl.uniform1f(p.uniform('u_aspect'), width/height);
      gl.uniform1f(p.uniform('u_tanFov'), Math.tan(this.fov * Math.PI / 360));
    };
    gl.disable(gl.BLEND);
    common(this.background);
    gl.uniform3fv(this.background.uniform('u_thermal'), background ? thermalRGB(state.temperature).map(c=>c*ev) : [0,0,0]);
    gl.uniform1f(this.background.uniform('u_grid'), Number(grid && !spatial));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,this.cmbTexture);
    gl.uniform1i(this.background.uniform('u_cmb'),0);
    gl.uniform1f(this.background.uniform('u_cmbOpacity'),showCmb && this.cmb ? 1-smoothstep(0.5e6,2e6,age) : 0);
    this.attribute(this.background,'a_position',this.triangle,2);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if (!this.catalogue) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    common(this.stars);
    gl.uniform1f(this.stars.uniform('u_pixelRatio'),ratio);
    gl.uniform1f(this.stars.uniform('u_flux'),state.flux*ev);
    gl.uniform1f(this.stars.uniform('u_population'),population ? state.population : 1);
    gl.uniform1f(this.stars.uniform('u_spatial'),Number(spatial));
    gl.uniform1f(this.stars.uniform('u_scale'),state.a);
    gl.uniform1f(this.stars.uniform('u_timeMyr'),age/1e6);
    gl.uniform1f(this.stars.uniform('u_evolve'),Number(population));
    gl.uniform1f(this.stars.uniform('u_cameraDistance'),this.cameraDistance);
    gl.uniform1f(this.stars.uniform('u_formation'),formation);
    gl.uniform1f(this.stars.uniform('u_seedCloud'),showCmb?smoothstep(150e6,350e6,age):0);
    this.attribute(this.stars,'a_position',this.buffers[0],3);
    this.attribute(this.stars,'a_magnitude',this.buffers[1],1);
    this.attribute(this.stars,'a_colour',this.buffers[2],3);
    this.attribute(this.stars,'a_depth',this.buffers[3],1);
    this.attribute(this.stars,'a_target',this.buffers[4],3);
    this.attribute(this.stars,'a_cmb',this.buffers[5],1);
    this.attribute(this.stars,'a_skySeed',this.buffers[6],4);
    this.attribute(this.stars,'a_birth',this.buffers[7],1);
    gl.drawArrays(gl.POINTS,0,this.catalogue.count);
    if(spatial) {
      common(this.galaxies);
      gl.uniform1f(this.galaxies.uniform('u_scale'),state.a);
      gl.uniform1f(this.galaxies.uniform('u_cameraDistance'),this.cameraDistance);
      gl.uniform1f(this.galaxies.uniform('u_pixelRatio'),ratio);
      gl.uniform1f(this.galaxies.uniform('u_population'),population ? smoothstep(180e6,1e9,age) : 1);
      gl.uniform1f(this.galaxies.uniform('u_exposure'),ev);
      gl.uniform1f(this.galaxies.uniform('u_formation'),formation);
      this.attribute(this.galaxies,'a_position',this.galaxyBuffers[0],3);
      this.attribute(this.galaxies,'a_colour',this.galaxyBuffers[1],3);
      this.attribute(this.galaxies,'a_seed',this.galaxyBuffers[2],1);
      this.attribute(this.galaxies,'a_initial',this.galaxyBuffers[3],3);
      gl.drawArrays(gl.POINTS,0,this.galaxyCount);
    }
  }
}
