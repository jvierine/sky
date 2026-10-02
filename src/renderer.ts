import type { Catalogue } from './catalog';
import { conditions, thermalRGB } from './cosmology';

const starVertex = `
attribute vec3 a_position;
attribute float a_magnitude;
attribute vec3 a_colour;
uniform vec3 u_right, u_up, u_forward;
uniform float u_aspect, u_tanFov, u_pixelRatio, u_flux, u_population;
varying vec3 v_colour;
varying float v_brightness;
void main() {
  float z = dot(a_position, u_forward);
  gl_Position = vec4(dot(a_position,u_right)/u_tanFov/u_aspect, dot(a_position,u_up)/u_tanFov, z-0.001, z);
  float flux = pow(10.0, -0.4*(a_magnitude-5.0)) * u_flux;
  gl_PointSize = clamp(1.4 + 3.1 * pow(flux, 0.25), 1.5, 16.0) * u_pixelRatio;
  v_colour = a_colour;
  v_brightness = (1.0-exp(-flux*0.95)) * u_population;
  if (z <= 0.01 || u_population <= 0.0) gl_Position = vec4(2.0,2.0,2.0,1.0);
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
void main() {
  vec3 colour = vec3(0.006,0.009,0.016) + (vec3(1.0)-exp(-u_thermal*0.42));
  if (u_grid>0.5) {
    vec3 ray = normalize(u_forward + v_uv.x*u_tanFov*u_aspect*u_right + v_uv.y*u_tanFov*u_up);
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
  private catalogue?: Catalogue;
  private buffers: WebGLBuffer[] = [];
  private triangle: WebGLBuffer;
  yaw = 1.4;
  pitch = 0.12;
  fov = 80;
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
        if (this.pinchDistance > 0) this.fov = Math.max(25, Math.min(110, this.fov * this.pinchDistance / distance));
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
      this.fov = Math.max(25, Math.min(110, this.fov + e.deltaY * 0.035));
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
  setCatalogue(catalogue: Catalogue) {
    this.catalogue = catalogue;
    for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
    this.buffers = [this.buffer(catalogue.positions), this.buffer(catalogue.magnitudes), this.buffer(catalogue.colours)];
  }
  reset() { this.yaw = 1.4; this.pitch = 0.12; this.fov = 80; this.onViewChange(); }
  render(age: number, exposure: number, population: boolean, background: boolean, grid: boolean, delta: number) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    if (this.keys.size) {
      const velocity = Math.min(delta, 0.05) * 0.65;
      this.yaw += (Number(this.keys.has('ArrowRight'))-Number(this.keys.has('ArrowLeft'))) * velocity;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (Number(this.keys.has('ArrowUp'))-Number(this.keys.has('ArrowDown'))) * velocity));
      this.fov = Math.max(25, Math.min(110, this.fov + (Number(this.keys.has('-'))-Number(this.keys.has('+') || this.keys.has('='))) * velocity * 35));
      this.onViewChange();
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.canvas.clientWidth * ratio), height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0,0,width,height);
    const forward = [Math.cos(this.pitch)*Math.cos(this.yaw), Math.sin(this.pitch), Math.cos(this.pitch)*Math.sin(this.yaw)];
    const right = [-Math.sin(this.yaw),0,Math.cos(this.yaw)];
    const up = [-Math.sin(this.pitch)*Math.cos(this.yaw),Math.cos(this.pitch),-Math.sin(this.pitch)*Math.sin(this.yaw)];
    const state = conditions(age), ev = 2 ** exposure;
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
    gl.uniform1f(this.background.uniform('u_grid'), Number(grid));
    this.attribute(this.background,'a_position',this.triangle,2);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if (!this.catalogue) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    common(this.stars);
    gl.uniform1f(this.stars.uniform('u_pixelRatio'),ratio);
    gl.uniform1f(this.stars.uniform('u_flux'),state.flux*ev);
    gl.uniform1f(this.stars.uniform('u_population'),population ? state.population : 1);
    this.attribute(this.stars,'a_position',this.buffers[0],3);
    this.attribute(this.stars,'a_magnitude',this.buffers[1],1);
    this.attribute(this.stars,'a_colour',this.buffers[2],3);
    gl.drawArrays(gl.POINTS,0,this.catalogue.count);
  }
}
