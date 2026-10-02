# Sky

An interactive TypeScript / WebGL journey from recombination to the present.
Live at **[juha.no/stars](https://juha.no/stars/)**.

Drag the sky to look around, scroll or pinch to zoom, and use the timeline or
epoch buttons to travel through cosmic time. The canvas also supports arrow
keys and +/−. Exposure is independent of the physical conditions. “The model”
explains the approximation and offers population, background, and grid toggles.

## Run

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/stars/. The production base path is `/stars/`.

```sh
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run deploy
```

To test the live deployment, set `SKY_TEST_URL=https://juha.no/stars/` before
running the browser tests. Deployment uploads only `dist/` into
`/var/www/html/stars`, retaining old hashed assets and uploading HTML last.
It does not change Apache configuration or other applications.

## Model

The user-requested first approximation treats the present-day Tycho star field
as a fixed angular template of comoving sources. For scale factor `a`:

- Mean source separation: `d/d₀ = a`.
- Mean number density for a fixed population: `n/n₀ = a⁻³`.
- Per-source inverse-square flux: `F/F₀ = a⁻²`.
- Equivalent magnitude shift: `Δm = 5 log₁₀(a)`.
- Background temperature: `T = 2.7255 K / a`.

Uniform expansion changes distances, but not sky directions. Tycho sources are
rendered in one GPU point draw call, using ICRS/J2000 coordinates and measured
V_T magnitudes. There is no atmosphere, horizon, or observer on Earth: this is
a freely oriented celestial sphere.

A flat ΛCDM Friedmann equation with `H₀=67.4 km/s/Mpc`, `Ωm=0.315`,
`Ωr=0.000092`, and `ΩΛ=1−Ωm−Ωr` is integrated in log scale factor to obtain
age. Radiation is included, which matters near recombination. The resulting
present age is approximately 13.8 billion years. Visible background radiance
is estimated from Planck's law at 650, 550, and 450 nm relative to a 3000 K
reference at 550 nm, then tone mapped. This is a three-channel visual colour
approximation, not a calibrated human-eye spectral response. The background
is isotropic; no fabricated Planck anisotropy map is used.

Population evolution is a deliberately schematic smooth fade from 150 to 600
million years, with zero stars in the dark ages. It does not model individual
birth/death histories, stellar masses, or the spatial distribution of early
galaxies. Turn it off to see the fixed-population expansion experiment at all
epochs. Density readouts refer to that fixed population, independently of the
schematic fade. Presets are illustrative milestones, not exact boundaries.

**This is not a reconstruction of the actual ancient sky.** Gravitationally
bound Milky Way stars do not follow cosmic expansion, and present-day Tycho
stars cannot simply be transported into the early universe. The toy flux law
omits cosmological dimming, redshifting stellar spectra, a past light cone,
stellar evolution, and dust. Star hues are explicitly illustrative because
the AIDA subset contains no B_T colour data. Display exposure and tone mapping
make faint light viewable without changing the reported physical quantities.

## Data & references

`public/data/tycho2_mag8.bin.gz` is the existing WISC/AIDA subset from
`jvierine/widefield-star-calibrator` (local checkout `aida-event`): 42,072
Tycho-2 main/supplement sources with `V_T < 8`. Its accompanying metadata
preserves source counts, selection, generation date, and the binary format.
No generated substitute stars are used.

- [ESA / Hipparcos and Tycho catalogues](https://www.cosmos.esa.int/web/hipparcos/catalogues)
- [ESA / Cosmic eras](https://www.esa.int/Science_Exploration/Space_Science/Cosmic_eras)
- [ESA / Why the microwave](https://www.esa.int/Science_Exploration/Space_Science/Planck/Why_the_microwave)
- [Planck 2018 cosmological parameters](https://arxiv.org/abs/1807.06209)
- [WISC/AIDA source](https://github.com/jvierine/widefield-star-calibrator)

Original application code: MIT license. The included catalogue subset is
attributed to ESA / the Tycho-2 team; the WISC/AIDA project is CC-BY-4.0.
