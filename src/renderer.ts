import type { Catalogue } from './catalog';
import { conditions, MIN_SCALE, smoothstep, thermalRGB } from './cosmology';
import type { CmbMap } from './cmb';
import { buildSkyEvolution, driftTime } from './sky-evolution';

const starVertex = `
attribute vec3 a_position, a_colour;
attribute float a_magnitude, a_birth;
attribute vec4 a_motion;
uniform vec3 u_right, u_up, u_forward;
uniform float u_aspect, u_tanFov, u_pixelRatio, u_exposure;
uniform float u_spatial, u_scale, u_cameraDistance, u_drift, u_timeMyr, u_evolve;
varying vec3 v_colour;
varying float v_brightness;
void main() {
  // Position in parsecs relative to a comoving observer. Momentum is stored in
  // pc/Gyr; the cosmological drift integral is in Gyr. Same equations as CPU.
  vec3 physical=u_scale*(a_position*a_motion.w-a_motion.xyz*u_drift);
  float distance=max(length(physical+u_forward*u_spatial*u_cameraDistance),0.0001);
  float flux=pow(10.0,-0.4*(a_magnitude-5.0))*u_exposure*pow(a_motion.w/distance,2.0);
  float born=mix(1.0,smoothstep(a_birth,a_birth+50.0,u_timeMyr),u_evolve);
  vec3 position=mix(normalize(physical),physical,u_spatial);
  // Preserve the measured direction exactly at the endpoint.
  if(u_scale>=1.0 && u_spatial<0.5) position=a_position;
  float z=dot(position,u_forward)+u_spatial*u_cameraDistance;
  gl_Position=vec4(dot(position,u_right)/u_tanFov/u_aspect,dot(position,u_up)/u_tanFov,z-0.001,z);
  // Additional VT 9–10 sources enter when their computed apparent magnitude
  // crosses the display's VT=9 limit. No time-dependent graphical fade-out.
  float detection=1.0;
  if(a_magnitude>=9.0) detection=smoothstep(pow(10.0,-1.6),pow(10.0,-1.56),flux/u_exposure);
  gl_PointSize=clamp(1.4+3.1*pow(flux,0.25),1.5,mix(4.0,16.0,u_scale))*u_pixelRatio;
  v_colour=a_colour;
  v_brightness=(1.0-exp(-flux*0.95))*born*detection;
  if(z<=0.01 || v_brightness<=0.0) gl_Position=vec4(2.0,2.0,2.0,1.0);
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
  private cmbTexture: WebGLTexture;
  private cmb?: CmbMap;
  private catalogue?: Catalogue;
  private buffers: WebGLBuffer[] = [];
  private brightCount = 0;
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
    this.cmbTexture=gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D,this.cmbTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,1,1,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,new Uint8Array([128]));
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
    this.gl.deleteBuffer(this.triangle);
    this.gl.deleteProgram(this.stars.program);
    this.gl.deleteProgram(this.background.program);
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
    const sky=buildSkyEvolution(catalogue);
    this.brightCount=sky.brightCount;
    this.buffers=[this.buffer(catalogue.positions),this.buffer(catalogue.magnitudes),this.buffer(catalogue.colours),this.buffer(sky.motion),this.buffer(sky.births)];
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
  render(age: number, exposure: number, population: boolean, background: boolean, grid: boolean, delta: number, showCmb=false, moving=true) {
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
    gl.uniform1f(this.stars.uniform('u_exposure'),ev);
    gl.uniform1f(this.stars.uniform('u_spatial'),Number(spatial));
    gl.uniform1f(this.stars.uniform('u_scale'),state.a);
    gl.uniform1f(this.stars.uniform('u_timeMyr'),age/1e6);
    gl.uniform1f(this.stars.uniform('u_evolve'),Number(population));
    gl.uniform1f(this.stars.uniform('u_drift'),moving?driftTime(Math.max(state.a,MIN_SCALE)):0);
    gl.uniform1f(this.stars.uniform('u_cameraDistance'),this.cameraDistance*150);
    this.attribute(this.stars,'a_position',this.buffers[0],3);
    this.attribute(this.stars,'a_magnitude',this.buffers[1],1);
    this.attribute(this.stars,'a_colour',this.buffers[2],3);
    this.attribute(this.stars,'a_motion',this.buffers[3],4);
    this.attribute(this.stars,'a_birth',this.buffers[4],1);
    gl.drawArrays(gl.POINTS,0,state.a===1 ? this.brightCount : this.catalogue.count);
  }
}
