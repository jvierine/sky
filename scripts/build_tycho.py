#!/usr/bin/env python3
"""Extend WISC/AIDA's WISCAT1 subset from the original Tycho-2 releases.

Uses the same J2000 RA/Dec/VT columns, deduplication and sort as AIDA's
tools/build_tycho2_catalog.js. Downloads are cached, never shipped to clients.
"""
# Adapted from Juha Vierinen and contributors' WISC/AIDA generator.
# https://github.com/jvierine/widefield-star-calibrator
# This adapted script: CC BY 4.0 https://creativecommons.org/licenses/by/4.0/
from pathlib import Path
import datetime
import gzip
import hashlib
import json
import math
import argparse
import struct
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--limit', type=int, default=9)
args = parser.parse_args()
limit = args.limit
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache-data' / 'tycho'
BASE = 'https://archive.eso.org/ASTROM/TYC-2/data/'
CACHE.mkdir(parents=True, exist_ok=True)
stars, sources, seen = [], [], set()
for name, columns in [('catalog.dat', (24, 25, 19)),
                      ('suppl_1.dat', (2, 3, 13)),
                      ('suppl_2.dat', (2, 3, 13))]:
    path = CACHE / name
    if not path.exists():
        print(f'Downloading {BASE}{name}', flush=True)
        temporary = path.with_suffix('.download')
        urllib.request.urlretrieve(BASE + name, temporary)
        temporary.rename(path)
    read = accepted = duplicates = 0
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for line in stream:
            digest.update(line)
            read += 1
            fields = line.decode('ascii').split('|')
            try:
                ra, dec, vt = (float(fields[i].strip()) for i in columns)
            except (ValueError, IndexError):
                continue
            if not all(map(math.isfinite, (ra, dec, vt))) or vt >= limit or not 0 <= ra <= 360 or not -90 <= dec <= 90:
                continue
            key = f'{ra:.7f}:{dec:.7f}:{vt:.3f}'
            if key in seen:
                duplicates += 1
                continue
            seen.add(key)
            stars.append((ra / 15, dec, vt))
            accepted += 1
    sources.append(dict(url=BASE + name, sha256=digest.hexdigest(),
                        columns=dict(ra=columns[0]+1, dec=columns[1]+1, vt=columns[2]+1),
                        inputRows=read, acceptedRows=accepted, duplicateRows=duplicates))
stars.sort(key=lambda row: (row[2], row[0], row[1]))
payload = b'WISCAT1\0' + struct.pack('<II', len(stars), 3) + b''.join(struct.pack('<fff', *row) for row in stars)
output = ROOT / f'public/data/tycho2_mag{limit}.bin.gz'
output.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
metadata = dict(stars=len(stars), maxMagnitudeExclusive=limit,
                selection=f'Tycho-2 main catalogue and both supplements, finite J2000 positions and VT < {limit}',
                format='WISCAT1: 8-byte magic, uint32 count, uint32 stride=3; Float32 little-endian RA hours, Dec degrees, VT magnitude',
                sources=sources, uncompressedBytes=len(payload), compressedBytes=output.stat().st_size,
                generatedAtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                generator='scripts/build_tycho.py; adapted from WISC/AIDA tools/build_tycho2_catalog.js (CC BY 4.0)')
output.with_name(f'tycho2_mag{limit}.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(f'Wrote {len(stars):,} observed stars; {output.stat().st_size:,} compressed bytes')
