import './style.css';
import { loadCatalogue } from './catalog';
import { loadCmb } from './cmb';
import { SkyRenderer } from './renderer';
import { driftTime } from './sky-evolution';
import { ageAtScaleFactor, ageFromSlider, conditions, epochs, formatAge, MIN_SCALE, scaleFactorAtAge, scalePosition, sliderFromAge, TODAY_YEARS } from './cosmology';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const scaleSlider = get<HTMLInputElement>('scale-factor'), exposure = get<HTMLInputElement>('exposure');
const dialog = get<HTMLDialogElement>('model-dialog');
const population = get<HTMLInputElement>('population'), background = get<HTMLInputElement>('background'), grid = get<HTMLInputElement>('grid');
const cmbMap=get<HTMLInputElement>('cmb-map'), motion=get<HTMLInputElement>('motion');
const play = get<HTMLButtonElement>('play');
const canvas = get<HTMLCanvasElement>('sky');
let renderer: SkyRenderer | undefined;
let catalogueCount = 0, playing = false, scaleValue = 1, selectedAge: number | null = TODAY_YEARS;
let displayedScale=1, viewMode:'space'|'sky'='sky';
scaleSlider.value='1';
let prevTime = performance.now();
let needsRender = true;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const compact = (n: number) => n >= 10000 ? n.toExponential(2).replace('e+', ' × 10^') : n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(3);
scaleSlider.min = String(MIN_SCALE);
// Both axes share the same linear scale-factor coordinate. Cosmic age is
// nonlinear in a; use Friedmann-integrated values at each tick.
for (const a of [MIN_SCALE, 0.2, 0.4, 0.6, 0.8, 1]) {
  for (const [id, label] of [
    ['scale-axis', a === MIN_SCALE ? '0.001' : a.toFixed(1)],
    ['age-axis', a === MIN_SCALE ? '0.0004' : (ageAtScaleFactor(a)/1e9).toFixed(1)],
  ]) {
    const tick = document.createElement('span');
    tick.className = `axis-tick${a===MIN_SCALE?' first':a===1?' last':''}`;
    tick.style.left = `${scalePosition(a)}%`;
    tick.textContent = label;
    get(id).append(tick);
  }
}

for (const [i, epoch] of epochs.entries()) {
  const button = document.createElement('button');
  button.className = 'epoch-button';
  button.dataset.index = String(i);
  button.innerHTML = `<span class="epoch-number">0${i+1}</span><span class="epoch-name">${epoch.name}</span><span class="epoch-age">${epoch.short}</span>`;
  button.addEventListener('click', () => { setPlaying(false); selectedAge = epoch.age; scaleValue = scaleFactorAtAge(epoch.age); scaleSlider.value = String(scaleValue); if(i===5 && viewMode!=='sky') chooseView('sky'); get('epochs').hidden=true; get('epoch-menu').setAttribute('aria-expanded','false'); update(); });
  get('epochs').append(button);
}
function currentAge() { return selectedAge ?? ageAtScaleFactor(scaleValue); }
function setPlaying(value: boolean) {
  playing = value;
  play.innerHTML = playing ? 'Ⅱ <span>Pause journey</span>' : '▶ <span>Play journey</span>';
  play.setAttribute('aria-label', playing ? 'Pause journey' : 'Play journey');
  play.classList.toggle('playing', playing);
}
function update() {
  needsRender = true;
  if(Math.abs(displayedScale-scaleValue)>1e-7) document.body.dataset.settled='false';
  const age = currentAge(), state = conditions(age), formatted = formatAge(age);
  let index = 0;
  for (let i = 1; i < epochs.length; i++) if (age >= epochs[i].age * 0.999) index = i;
  const epoch = epochs[index];
  get('epoch-title').textContent = viewMode==='space' && index===5 ? 'A universe in motion.' : epoch.title;
  get('epoch-description').textContent = cmbMap.checked && index===0 ? 'WMAP’s observed microwave fluctuations, enhanced in false colour. This overlay is not visible light.' : viewMode==='space' && index===5 ? 'The same 3D particles, viewed from outside the simulated volume. Rewind to see physical distances contract.' : epoch.description;
  get('age').innerHTML = `${formatted.value} <small>${age>=1e9?'Gyr':age>=1e6?'Myr':'yr'}</small>`;
  get('temperature').innerHTML = `${state.temperature >= 100 ? state.temperature.toFixed(0) : state.temperature.toFixed(2)} <small>K</small>`;
  get('scale').innerHTML = `${state.a < 0.01 ? state.a.toFixed(5) : state.a.toFixed(3)} <small>a</small>`;
  get('epoch-index').textContent = `0${index+1} / 06`;
  document.querySelectorAll<HTMLButtonElement>('.epoch-button').forEach((button, i) => { button.classList.toggle('active',i===index); button.setAttribute('aria-pressed',String(i===index)); });
  scaleSlider.style.setProperty('--progress', `${scalePosition(scaleValue)}%`);
  scaleSlider.setAttribute('aria-valuetext', `a = ${scaleValue.toPrecision(4)}, ${(age/1e9).toPrecision(4)} Gyr after the Big Bang`);
  get('slider-scale').textContent = `a = ${scaleValue < 0.01 ? scaleValue.toFixed(5) : scaleValue.toFixed(3)}`;
  get('distance-ratio').textContent = compact(state.a);
  get('density-ratio').textContent = compact(state.density);
  get('flux-ratio').textContent = compact(state.flux);
  get('redshift').textContent = state.redshift.toFixed(state.redshift < 10 ? 2 : 0);
  get('peak-wavelength').textContent = state.peakMeters >= 0.001 ? `${(state.peakMeters*1000).toFixed(2)} mm` : `${(state.peakMeters*1e6).toFixed(2)} µm`;
  get('exposure-value').textContent = `${Number(exposure.value)>0?'+':''}${Number(exposure.value).toFixed(1)} EV`;
  const starsAbsent = population.checked && state.population === 0;
  const hiddenGlow = background.checked && state.temperature > 1500;
  const seedField=cmbMap.checked && age<2e6;
  get('sky-state').textContent = seedField ? 'WMAP · enhanced microwave overlay' : viewMode==='space' ? '3D model · same simulated particles' : starsAbsent ? hiddenGlow ? 'Visible light · a sky filled with primordial glow' : 'Visible light · no stars yet' : !population.checked ? 'Fixed population · counterfactual Tycho sky' : state.a===1 ? 'Tycho-2 catalogue · present-day sky' : 'Expanding particles · assumed depths and velocities';
  get('model-label').textContent=viewMode==='space' ? 'External 3D model' : state.a===1 ? 'Measured Tycho-2 sky' : starsAbsent ? seedField ? 'WMAP · enhanced microwave colour' : hiddenGlow ? 'Recombination · visible thermal glow' : 'Dark ages · no visible stars' : '3D expansion · simulated stellar tracers';
  get('angular-ratio').textContent=driftTime(Math.max(MIN_SCALE,state.a)).toFixed(2)+' Gyr';
  get('cmb-legend').hidden=!seedField;
  document.body.dataset.epoch = epoch.name;
  document.body.dataset.view=viewMode;
}
scaleSlider.addEventListener('input', () => { setPlaying(false); selectedAge = null; scaleValue = Number(scaleSlider.value); update(); });
exposure.addEventListener('input', update);
for (const checkbox of [population,background,grid,cmbMap,motion]) checkbox.addEventListener('change', update);
function chooseView(mode:'space'|'sky') {
  viewMode=mode;
  renderer?.setMode(mode);
  get('view-space').setAttribute('aria-pressed',String(mode==='space'));
  get('view-sky').setAttribute('aria-pressed',String(mode==='sky'));
  update();
}
for(const mode of ['space','sky'] as const) get(`view-${mode}`).addEventListener('click',()=>chooseView(mode));
play.addEventListener('click', () => {
  if (!playing && scaleValue >= 0.9999) { scaleValue = MIN_SCALE; selectedAge = null; scaleSlider.value = String(MIN_SCALE); update(); }
  setPlaying(!playing);
});
get('about').addEventListener('click', () => dialog.showModal());
get('epoch-menu').addEventListener('click',()=>{
  const open=get('epoch-menu').getAttribute('aria-expanded')!=='true';
  get('epoch-menu').setAttribute('aria-expanded',String(open));
  get('epochs').hidden=!open;
});
get('toggle-exposure').addEventListener('click',()=>{
  const panel=get('view-tools');
  panel.hidden=!panel.hidden;
  get('toggle-exposure').setAttribute('aria-expanded',String(!panel.hidden));
});
get('close-model').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) { const rect = dialog.getBoundingClientRect(); if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom) dialog.close(); } });
get('reset').addEventListener('click', () => renderer?.reset());
get('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { showError('Fullscreen is unavailable in this browser. You can still explore the sky normally.'); }
});
function showError(message: string) { const error = get('error'); error.hidden = false; error.textContent = message; }
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); setPlaying(false); document.body.dataset.ready = 'false'; showError('The graphics connection was interrupted. Waiting to restore the sky…'); });
canvas.addEventListener('webglcontextrestored', () => { void initialize(); });
async function initialize() {
  try {
    renderer?.dispose();
    renderer = new SkyRenderer(canvas);
    renderer.onViewChange = () => { needsRender = true; get('fov').textContent = `${Math.round(renderer!.fov)}°`; };
    renderer.setMode(viewMode);
    renderer.onViewChange = () => { needsRender = true; get('fov').textContent = viewMode==='space' ? `${(10/renderer!.cameraDistance).toFixed(1)}×` : `${Math.round(renderer!.fov)}°`; };
    const [catalogue,cmb] = await Promise.all([loadCatalogue(),loadCmb()]);
    renderer.setCatalogue(catalogue,cmb);
    catalogueCount = catalogue.count;
    get('catalog-status').innerHTML = `<span class="status-dot"></span> ${catalogue.magnitudes.filter(m=>m<9).length.toLocaleString('en-US')} TYCHO-2 STARS <span class="catalog-detail"> / V<sub>T</sub> &lt; 9</span>`;
    get('error').hidden = true;
    document.body.dataset.ready = 'true';
    needsRender = true;
    renderer.onViewChange();
  } catch (e) {
    get('catalog-status').textContent = 'Sky unavailable';
    showError(e instanceof Error ? e.message : 'The sky could not be loaded. Please reload.');
  }
}
function frame(now: number) {
  const delta = Math.min((now-prevTime)/1000, 0.1);
  prevTime = now;
  if (playing && !document.hidden && !dialog.open && catalogueCount) {
    // Playback still lingers in early epochs, while the slider is linear in a.
    const progress = Math.min(1000, sliderFromAge(currentAge())+delta*35);
    selectedAge = ageFromSlider(progress);
    scaleValue = scaleFactorAtAge(selectedAge);
    scaleSlider.value = String(scaleValue);
    update();
    if(progress>=1000) { setPlaying(false); if(viewMode!=='sky') chooseView('sky'); }
  }
  const difference=scaleValue-displayedScale;
  if(Math.abs(difference)>1e-7) {
    displayedScale+=difference*(1-Math.exp(-delta*14));
    needsRender=true;
    document.body.dataset.settled='false';
  } else {
    if(displayedScale!==scaleValue) needsRender=true;
    displayedScale=scaleValue;
    document.body.dataset.settled='true';
  }
  // Smoothly approach a requested epoch, then stop rendering when idle.
  if (!document.hidden && (needsRender || renderer?.hasActiveKeys)) {
    needsRender = false;
    renderer?.render(ageAtScaleFactor(displayedScale),Number(exposure.value),population.checked,background.checked,grid.checked,delta,cmbMap.checked,motion.checked);
  }
  requestAnimationFrame(frame);
}
document.body.classList.toggle('reduced-motion', reducedMotion);
window.addEventListener('resize', () => { needsRender = true; });
document.addEventListener('visibilitychange', () => { needsRender = true; prevTime = performance.now(); });
update();
void initialize();
requestAnimationFrame(frame);
