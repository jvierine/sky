# Sky

Interactive TypeScript / WebGL cosmic history, live at **[juha.no/stars](https://juha.no/stars/)**.

The default view is the sky from a hypothetical planet, starting at today’s measured
Tycho-2 star positions and magnitudes. Rewind to the observed WMAP nine-year microwave
temperature map and play forward through a schematic emergence of stars, ending at
the catalogue sky. Drag to look around, scroll or pinch to zoom, and move the
linear scale-factor `a` slider. Its secondary axis shows time after the Big Bang in
Gyr, integrated from the Friedmann equation. Playback uses logarithmic age so the
early epochs remain visible. Smooth transitions animate expansion between selections.

**Planet sky** uses all 120,530 measured Tycho directions on a celestial sphere. It
draws no synthetic galaxies or clusters. “Today” always returns to this view. The
optional **External 3D model**, available only inside **Model & sources**, assigns
illustrative depths and cluster positions and adds 900 galaxy tracers to demonstrate
expansion from outside a volume. It is explicitly a separate model, not a planet sky.
The canvas supports arrow keys and +/−; exposure adjusts visibility. Scientific
citations and switches for WMAP, stellar populations, thermal light and the sky
grid are in the same dialog. Controls and secondary labels use at least 14px text;
phone layouts scroll to preserve readable type instead of shrinking controls.

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

The requested first approximation scales fixed source separations by `a`, number
density by `a⁻³`, and per-source flux by `a⁻²` (`Δm = 5 log₁₀(a)`). In 3D, after the
formation morph, positions follow `x(t) = a(t) x₀` with a fixed external camera.
Isotropic expansion preserves directions in the Sky view.

Flat ΛCDM uses Planck 2018 values `H₀=67.4 km/s/Mpc`, `Ωm=0.315`, plus simplified
radiation `Ωr=0.000092` and `ΩΛ=1−Ωm−Ωr`. Numerical integration gives an age near
13.8 Gyr. The background cools as `T=2.7255 K/a`; visible radiance samples Planck's
law at 650, 550 and 450 nm, followed by tone mapping. This is an approximate
three-channel colour response.

The WMAP ILC map is observed data in Galactic coordinates with a 1° beam, reprojected
into the viewing direction. False colour enhances temperature differences over
±200 µK. Temperature anisotropy is **not a direct matter-density map**. Hot angular
patches seed deterministic illustrative cluster centres. Diffuse points emerge as
the map fades, positions morph toward clusters over 30 Myr–1.3 Gyr, stars fade in
from 150–600 Myr and galaxy sprites from 180 Myr–1 Gyr. These interpolation choices
are artistic, not outputs of a structure-formation calculation. The WMAP product
has residual foregrounds and small-scale uncertainty; see its product documentation.

This is a schematic visual experiment, not a reconstruction of the ancient sky
or an N-body simulation. Bound stars and galaxies do not expand with the universe.
The expansion approximation nevertheless scales all tracers after formation. Tycho
stars are present-day measured sources, not identified primordial stars. Synthetic
depths, colours and galaxy sprites are clearly distinguished from observations.
The toy flux law omits stellar evolution, dust, spectral redshift, cosmological
surface-brightness dimming and a past light cone. Population evolution can be disabled
for a fixed-population experiment; density readouts always describe that experiment.

## Data and reproducibility

`public/data/tycho2_mag9.bin.gz` contains **120,530 sources with V_T < 9**, from the
Tycho-2 main catalogue and both supplements. The selection is one magnitude deeper
than WISC/AIDA's original V_T < 8 subset. `scripts/build_tycho.py` adapts AIDA's
column selection, WISCAT1 binary layout, deduplication and sorting, while rejecting
blank or invalid positions/magnitudes. It downloads the original ESO-hosted catalogue
releases and records SHA-256 hashes, source columns and counts in `tycho2_mag9.json`.
J2000 mean positions and V_T magnitudes are measured; no replacement stars are generated.

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

Original app code: MIT. Catalogue observations: ESA / Tycho-2 team. The catalogue
builder adapts [WISC/AIDA](https://github.com/jvierine/widefield-star-calibrator),
a CC BY 4.0 project by Juha Vierinen and contributors; that script remains under
CC BY 4.0. See `public/data/README.md` for attribution. The MIT licence does not
relicense observational data or the adapted builder.
