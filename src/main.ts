import './style.css';
import { loadCatalogue } from './catalog';
import { SkyRenderer } from './renderer';
import { ageFromSlider, conditions, epochs, formatAge, sliderFromAge, TODAY_YEARS } from './cosmology';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const time = get<HTMLInputElement>('time'), exposure = get<HTMLInputElement>('exposure');
const dialog = get<HTMLDialogElement>('model-dialog');
const population = get<HTMLInputElement>('population'), background = get<HTMLInputElement>('background'), grid = get<HTMLInputElement>('grid');
const play = get<HTMLButtonElement>('play');
const canvas = get<HTMLCanvasElement>('sky');
let renderer: SkyRenderer | undefined;
let catalogueCount = 0, playing = false, sliderValue = 1000, selectedAge: number | null = TODAY_YEARS;
let prevTime = performance.now();
let needsRender = true;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const compact = (n: number) => n >= 10000 ? n.toExponential(2).replace('e+', ' × 10^') : n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(3);

for (const [i, epoch] of epochs.entries()) {
  const button = document.createElement('button');
  button.className = 'epoch-button';
  button.dataset.index = String(i);
  button.innerHTML = `<span class="epoch-number">0${i+1}</span><span class="epoch-name">${epoch.name}</span><span class="epoch-age">${epoch.short}</span>`;
  button.addEventListener('click', () => { setPlaying(false); selectedAge = epoch.age; sliderValue = sliderFromAge(epoch.age); time.value = String(sliderValue); update(); });
  get('epochs').append(button);
}
function currentAge() { return selectedAge ?? ageFromSlider(sliderValue); }
function setPlaying(value: boolean) {
  playing = value;
  play.innerHTML = playing ? 'Ⅱ <span>Pause journey</span>' : '▶ <span>Play journey</span>';
  play.setAttribute('aria-label', playing ? 'Pause journey' : 'Play journey');
  play.classList.toggle('playing', playing);
}
function update() {
  needsRender = true;
  const age = currentAge(), state = conditions(age), formatted = formatAge(age);
  let index = 0;
  for (let i = 1; i < epochs.length; i++) if (age >= epochs[i].age * 0.999) index = i;
  const epoch = epochs[index];
  get('epoch-title').textContent = epoch.title;
  get('epoch-description').textContent = epoch.description;
  get('age').innerHTML = `${formatted.value} <small>${formatted.unit}</small>`;
  get('temperature').innerHTML = `${state.temperature >= 100 ? state.temperature.toFixed(0) : state.temperature.toFixed(2)} <small>K</small>`;
  get('scale').innerHTML = `${state.a < 0.01 ? state.a.toFixed(5) : state.a.toFixed(3)} <small>a</small>`;
  get('epoch-index').textContent = `0${index+1} / 06`;
  document.querySelectorAll<HTMLButtonElement>('.epoch-button').forEach((button, i) => { button.classList.toggle('active',i===index); button.setAttribute('aria-pressed',String(i===index)); });
  time.style.setProperty('--progress', `${sliderValue/10}%`);
  time.setAttribute('aria-valuetext', `${formatted.value} ${formatted.unit} after the Big Bang`);
  get('distance-ratio').textContent = compact(state.a);
  get('density-ratio').textContent = compact(state.density);
  get('flux-ratio').textContent = compact(state.flux);
  get('redshift').textContent = state.redshift.toFixed(state.redshift < 10 ? 2 : 0);
  get('peak-wavelength').textContent = state.peakMeters >= 0.001 ? `${(state.peakMeters*1000).toFixed(2)} mm` : `${(state.peakMeters*1e6).toFixed(2)} µm`;
  get('exposure-value').textContent = `${Number(exposure.value)>0?'+':''}${Number(exposure.value).toFixed(1)} EV`;
  const starsAbsent = population.checked && state.population === 0;
  const hiddenGlow = background.checked && state.temperature > 1500;
  get('sky-state').textContent = starsAbsent ? hiddenGlow ? 'Visible light · a sky filled with primordial glow' : 'Visible light · no stars yet' : !population.checked ? 'Fixed population · counterfactual Tycho sky' : 'Visible light · schematic stellar population';
  document.body.dataset.epoch = epoch.name;
}
time.addEventListener('input', () => { setPlaying(false); selectedAge = null; sliderValue = Number(time.value); update(); });
exposure.addEventListener('input', update);
for (const checkbox of [population,background,grid]) checkbox.addEventListener('change', update);
play.addEventListener('click', () => {
  if (!playing && sliderValue >= 999) { sliderValue = 0; selectedAge = null; time.value = '0'; update(); }
  setPlaying(!playing);
});
get('about').addEventListener('click', () => dialog.showModal());
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
    const catalogue = await loadCatalogue();
    renderer.setCatalogue(catalogue);
    catalogueCount = catalogue.count;
    get('catalog-status').innerHTML = `<span class="status-dot"></span> ${catalogueCount.toLocaleString('en-US')} TYCHO-2 STARS <span class="catalog-detail"> / V<sub>T</sub> &lt; 8</span>`;
    get('error').hidden = true;
    document.body.dataset.ready = 'true';
    needsRender = true;
  } catch (e) {
    get('catalog-status').textContent = 'Sky unavailable';
    showError(e instanceof Error ? e.message : 'The sky could not be loaded. Please reload.');
  }
}
function frame(now: number) {
  const delta = Math.min((now-prevTime)/1000, 0.1);
  prevTime = now;
  if (playing && !document.hidden && !dialog.open && catalogueCount) {
    selectedAge = null;
    sliderValue = Math.min(1000,sliderValue+delta*35);
    time.value = String(sliderValue);
    update();
    if(sliderValue>=1000) setPlaying(false);
  }
  // No automatic camera motion: the journey only animates when requested.
  if (!document.hidden && (needsRender || renderer?.hasActiveKeys)) {
    needsRender = false;
    renderer?.render(currentAge(),Number(exposure.value),population.checked,background.checked,grid.checked,delta);
  }
  requestAnimationFrame(frame);
}
document.body.classList.toggle('reduced-motion', reducedMotion);
window.addEventListener('resize', () => { needsRender = true; });
document.addEventListener('visibilitychange', () => { needsRender = true; prevTime = performance.now(); });
update();
void initialize();
requestAnimationFrame(frame);
