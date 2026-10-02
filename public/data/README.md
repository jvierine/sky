# Data attribution

## Tycho-2

120,530 observed main-catalogue and supplement sources with V_T < 9, plus
a 329,281-source V_T < 10 selection used to reveal fainter stars when closer.
Positions are ICRS/J2000 mean positions; magnitudes are measured Tycho V_T.
Original observations/catalogue: ESA / the Hipparcos and Tycho-2 teams.
[Catalogue paper](https://archive.eso.org/ASTROM/TYC-2/docs/aa2000a.pdf) and
[original data release](https://archive.eso.org/ASTROM/TYC-2/data/).

Rebuilt one magnitude deeper than the original V_T < 8 sample with
`scripts/build_tycho.py`, adapting the generator and binary format from
[WISC/AIDA](https://github.com/jvierine/widefield-star-calibrator), a
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) project by Juha Vierinen
and contributors. Changes: Python port, deeper cut, reject blank or invalid
fields, record source hashes. Source URLs, SHA-256 hashes, counts and format
are in `tycho2_mag9.json` and `tycho2_mag10.json`.

## WMAP

Credit: NASA / WMAP Science Team / LAMBDA.
[WMAP nine-year ILC product](https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_info.html).
The supplied texture is reprojected from the observed FITS map using healpy,
clipped to ±200 µK and quantized. It retains the 1° input beam. Generation is
reproducible with `scripts/build_cmb.py`; `wmap9.json` records the source URL,
original SHA-256, units and display encoding. False colour is a display choice. The map is an optional microwave overlay;
it is not a 3D density field and does not determine particle trajectories.

The application's MIT licence does not replace these credits or relicense the
observational data. The adapted Tycho builder is CC BY 4.0.
