#!/usr/bin/env python3
"""Project the observed WMAP nine-year ILC map into a small WebGL texture.

Requires numpy, astropy and healpy. The browser has no Python dependency.
"""
from pathlib import Path
import gzip
import hashlib
import json
import struct
import urllib.request

import healpy as hp
import numpy as np
from astropy.io import fits

ROOT = Path(__file__).resolve().parent.parent
URL = "https://lambda.gsfc.nasa.gov/data/map/dr5/dfp/ilc/wmap_ilc_9yr_v5.fits"
cache = ROOT / ".cache-data/wmap_ilc_9yr_v5.fits"
cache.parent.mkdir(exist_ok=True)
if not cache.exists():
    urllib.request.urlretrieve(URL, cache)
with fits.open(cache) as hdus:
    header = hdus[1].header
    ordering = header["ORDERING"].strip()
    unit = header["TUNIT1"].strip()
    print("WMAP", header["NSIDE"], ordering, unit)
    sky = np.asarray(hdus[1].data.field(0), dtype=float).reshape(-1)
    if unit.lower() not in ("mk", "millikelvin", "mk, thermodynamic"):
        raise ValueError(f"Unexpected WMAP units: {unit}")
width, height = 1024, 512
longitude, theta = np.meshgrid(
    (np.arange(width) + .5) / width * 2 * np.pi,
    (np.arange(height) + .5) / height * np.pi,
)
microkelvin = hp.get_interp_val(sky, theta, longitude, nest=ordering == "NESTED") * 1000
limit = 200.0
pixels = np.rint((np.clip(microkelvin, -limit, limit) / limit + 1) * 127.5).astype(np.uint8)
payload = b"WMAPCMB1" + struct.pack("<II", width, height) + pixels.tobytes()
output = ROOT / "public/data/wmap9.bin.gz"
output.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
metadata = {
    "source": URL,
    "product": "WMAP nine-year Internal Linear Combination, v5",
    "credit": "NASA / WMAP Science Team / LAMBDA",
    "reference": "https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_info.html",
    "sourceSha256": hashlib.sha256(cache.read_bytes()).hexdigest(),
    "inputNside": 512,
    "inputOrdering": ordering,
    "inputUnit": unit,
    "nativeBeamDegrees": 1,
    "coordinateSystem": "Galactic",
    "projection": "equirectangular; longitude increasing left to right, north to south rows",
    "width": width,
    "height": height,
    "encoding": "WMAPCMB1 + uint32 LE width + uint32 LE height + uint8 temperature; microkelvin=(byte/255*2-1)*200",
    "displayRangeMicrokelvin": [-limit, limit],
    "unclippedRmsMicrokelvin": float(np.std(microkelvin)),
    "quantizationMicrokelvin": 2 * limit / 255,
    "processing": "HEALPix bilinear interpolation, clipping and quantization; no generated replacement anisotropies",
}
output.with_name("wmap9.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(output, len(payload), output.stat().st_size)
