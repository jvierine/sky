# Sky

Interactive TypeScript / WebGL cosmic history, live at **[juha.no/stars](https://juha.no/stars/)**.

The default view is the sky from an observer inside a 3D expanding particle volume.
Today matches the measured 120,530 Tycho-2 sources with VT < 9. Earlier epochs evolve
physical particle positions and inverse-square brightness. An additional observed
VT 9–10 catalogue population becomes detectable when closer. There are no forced
angular patches, cluster morphs or galaxy sprites.

Drag to look around, scroll or pinch to zoom, and move the slim linear scale-factor
`a` slider. The secondary axis shows Gyr after the Big Bang. Playback lingers in
early epochs; “Epochs” opens presets. Model & sources includes the equations,
assumptions, a relative-motion switch, and an optional observed WMAP microwave
overlay. Touch controls and readable text work on phones.

## Run and deploy

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/stars/. Production uses the `/stars/` base path.

```sh
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run deploy
```

Set `SKY_TEST_URL=https://juha.no/stars/` to run browser tests against the live site.
Deployment uploads `dist/` to `/var/www/html/stars` over SSH as `j@juha.no`, retaining
old hashed assets and uploading HTML last.

## Model

The simulator uses the **force-free particle limit** in an FLRW background:

- Physical coordinates `r=a*x`.
- Canonical momentum `p=a² dx/dt` is conserved (no mutual gravity).
- Peculiar velocities `v=p/a` decay through Hubble drag.
- Numerically integrate `J(a)=∫ from t(a) to today dt/a²` with 8,192 logarithmic
  scale-factor intervals. Solve `x(a)=x0-p*J(a)` and project `r(a)` from the observer.
- Calibrate each constant luminosity to its measured Tycho magnitude at its assumed
  present distance. Compute `F/F0=(d0/d)²`, including the observer position.

Endpoint priors are log-uniform 100–1,500pc distances and isotropic Gaussian
present-day peculiar velocities with component dispersion 0.002km/s. These are
chosen model parameters, **not measured distances or proper motions**. The comoving
observer sits at the origin. The external view projects the same particles from a
displaced camera, with its own distances in the flux calculation.

Turning relative motion off gives exact Hubble scaling: every 3D separation grows
with `a`, density scales as `a⁻³`, flux as `a⁻²`, and sky angles remain unchanged.
With motion enabled, angular separations can increase or decrease. There is no
constraint forcing all apparent neighbours apart. The exact measured Tycho direction
is used at `a=1`. VT 9–10 sources enter when their computed apparent magnitude crosses
the display's VT=9 limit, with a 0.1-magnitude detection transition.

Flat ΛCDM uses Planck 2018 values `H0=67.4km/s/Mpc`, `Ωm=0.315`, simplified
radiation `Ωr=0.000092` and `ΩΛ=1−Ωm−Ωr`. Friedmann integration gives an age near
13.8Gyr. The background cools as `T=2.7255K/a`; visible radiance samples Planck's
law at 650, 550 and 450nm before tone mapping.

Default recombination shows a nearly uniform warm thermal glow. The optional WMAP
ILC overlay is actual microwave temperature data in Galactic coordinates with a
1° beam and ±200µK enhanced false colour. It fades between 0.5 and 2Myr. It is not
a matter-density map and does not seed invented stellar trajectories. The dark ages
have no visible matter emission or stars. Assumed tracer births occur at 150–550Myr
with 50Myr luminosity ramps; this phase switch is not a formation solver.

This is a **simulation experiment, not a reconstruction of the ancient sky**.
Real bound stars and galaxies do not follow Hubble expansion. Tycho sources do not
identify primordial stars; the catalogue subset lacks 3D positions and velocities.
The model omits mutual gravity, galaxy formation, stellar evolution/death, dust
and a past light cone. The local parsec-scale volume uses Euclidean inverse-square
flux. It does not treat sources as cosmologically distant galaxies or infer their
redshifts from the cosmic epoch. Colours, exposure response and formation times are
illustrative. Disabling population evolution gives a fixed-population experiment.

## Data and reproducibility

`public/data/tycho2_mag9.bin.gz` contains **120,530 sources with V_T < 9**, from the
Tycho-2 main catalogue and both supplements. The selection is one magnitude deeper
than WISC/AIDA's original V_T < 8 subset. `scripts/build_tycho.py` adapts AIDA's
column selection, WISCAT1 binary layout, deduplication and sorting, while rejecting
blank or invalid positions/magnitudes. It downloads the original ESO-hosted catalogue
releases and records SHA-256 hashes, source columns and counts in `tycho2_mag9.json`.
J2000 mean positions and V_T magnitudes are measured; no replacement stars are generated.
`tycho2_mag10.bin.gz` extends the same observed selection to VT < 10 for the
fainter population, while the original magnitude-9 catalogue is retained for
endpoint verification. Generate it with `python3 scripts/build_tycho.py --limit 10`.

`public/data/wmap9.bin.gz` is a 1024 × 512 Galactic equirectangular reprojection of
NASA LAMBDA's WMAP nine-year ILC FITS map. `scripts/build_cmb.py` uses healpy interpolation,
converts thermodynamic mK to µK, clips at ±200 µK and quantizes to 8 bits. Metadata
records provenance, the original FITS SHA-256 and display encoding. Download caches
are ignored by Git. Regenerate with:

```sh
python3 scripts/build_tycho.py
# Requires numpy, astropy and healpy:
python3 scripts/build_cmb.py
```

## Scientific references

1. [NASA LAMBDA: WMAP nine-year ILC map](https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_info.html).
   Observed map, processing and limitations. Credit NASA / WMAP Science Team / LAMBDA.
2. [Planck Collaboration (2020), Planck 2018 results. VI. Cosmological parameters,
   A&A 641, A6](https://doi.org/10.1051/0004-6361/201833910).
   [Open paper](https://arxiv.org/abs/1807.06209). Expansion parameters and ΛCDM.
3. [Bennett et al. (2013), Nine-Year WMAP Observations: Final Maps and Results,
   ApJS 208, 20](https://arxiv.org/abs/1212.5225). Final temperature observations.
4. [Bromm & Yoshida (2011), The First Galaxies, ARA&A 49, 373–407](https://doi.org/10.1146/annurev-astro-081710-102608).
   [Open paper](https://arxiv.org/abs/1102.4638). Physical context for early structure.
5. [Høg et al. (2000), The Tycho-2 catalogue of the 2.5 million brightest stars,
   A&A 355, L27–L30](https://archive.eso.org/ASTROM/TYC-2/docs/aa2000a.pdf).
   Measured stellar positions and magnitudes.
6. [Fixsen (2009), The Temperature of the Cosmic Microwave Background,
   ApJ 707, 916–920](https://arxiv.org/abs/0911.1955). Present-day CMB temperature.

7. [Springel (2006), GADGET coordinate and velocity definitions](https://wwwmpa.mpa-garching.mpg.de/gadget/gadget-list/0113.html).
8. [ESA / Planck: History of cosmic structure formation](https://www.esa.int/Science_Exploration/Space_Science/Planck/History_of_cosmic_structure_formation).

Original app code: MIT. Catalogue observations: ESA / Tycho-2 team. The catalogue
builder adapts [WISC/AIDA](https://github.com/jvierine/widefield-star-calibrator),
a CC BY 4.0 project by Juha Vierinen and contributors; that script remains under
CC BY 4.0. See `public/data/README.md` for attribution. The MIT licence does not
relicense observational data or the adapted builder.
