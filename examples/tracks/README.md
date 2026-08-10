# Example tracks

Only synthetic or explicitly redistributable tracks belong here.

Every example needs a nearby source, license, coordinate-frame,
expected-property, and privacy record. Public availability or a personal GPS
trace is not enough to establish redistribution rights.

## `circuito-aurora.okl.json` — synthetic

A fictional local-Cartesian circuit created for OpenKartLine. It does not
represent a real venue, contains no imagery or telemetry, and is distributed
under the repository's Apache-2.0 license. Its coordinates are meters and its
last centerline point does not repeat the first.

## Circuits derived from OpenStreetMap

The four circuits below are derived from OpenStreetMap and are **not** covered by
the repository's Apache-2.0 license. They are a Derivative Database under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/) and
carry its attribution and share-alike obligations.

> © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)

Any redistribution of these files, or of a database derived from them, must keep
that notice — including the published web bundle, which is why the editor shows
the credit whenever one of these circuits is loaded. See
[THIRD_PARTY.md](../../THIRD_PARTY.md).

Both were extracted with `scripts/import_osm_kart_track.py`, which records the
way id it read so any file here can be regenerated and audited.

### Coordinate frame

Node latitude/longitude in WGS84, projected to a local metric Cartesian frame
with an equirectangular projection about the way's centroid:

```text
x = R * (lon - lon0) * cos(lat0)     y = R * (lat - lat0)     R = 6378137 m
```

Over a few hundred metres this stays well under a metre of distortion, which is
inside the accuracy the source geometry itself offers. The closing node is
dropped and the way is resampled to roughly even arc-length spacing.

### `volta-redonda.okl.json`

| Field | Value |
|---|---|
| Source | OSM [way/712502411](https://www.openstreetmap.org/way/712502411), version 3 |
| Extracted | 2026-08-10 via the Overpass API |
| Source tags | `name=Kartódromo Internacional de Volta Redonda`, `highway=raceway`, `sport=motor` |
| Local origin | lat -22.502212, lon -44.083959 |
| Centerline length | 830 m over 76 points |
| Travel direction | Derived from OSM node order. **Not verified** against the venue's actual racing direction. |
| Track width | 8.0 m — **estimate**, not sourced. OSM does not tag this circuit's width. |
| Privacy | Public infrastructure geometry only. No telemetry, imagery, or personal data. |

The site perimeter is mapped separately as way/273890414 (`sport=karting`); this
file uses the raceway way, which is the driving surface.

### `adria-karting-raceway.okl.json`

| Field | Value |
|---|---|
| Source | OSM [way/798432703](https://www.openstreetmap.org/way/798432703), version 1 |
| Extracted | 2026-08-10 via the Overpass API |
| Source tags | `name=Adria Karting Raceway`, `highway=raceway`, `sport=karting` |
| Centerline length | 1259 m over 115 points |
| Travel direction | Derived from OSM node order. **Not verified** against the venue's actual racing direction. |
| Track width | 8.0 m — **estimate**, not sourced. |
| Privacy | Public infrastructure geometry only. No telemetry, imagery, or personal data. |

### `castelo-branco.okl.json`

| Field | Value |
|---|---|
| Source | OSM [way/1011069080](https://www.openstreetmap.org/way/1011069080), version 5 |
| Extracted | 2026-08-10 via the Overpass API |
| Source tags | `name=Kartódromo de Castelo Branco`, `highway=raceway`, `sport=karting`, `surface=asphalt` |
| Local origin | lat 39.860198, lon -7.458922 |
| Centerline length | 1192 m over 109 points |
| Travel direction | Derived from OSM node order. **Not verified** against the venue's actual racing direction. |
| Track width | 8.0 m — **estimate**, not sourced. |
| Privacy | Public infrastructure geometry only. No telemetry, imagery, or personal data. |

### `baltar.okl.json`

| Field | Value |
|---|---|
| Source | OSM [way/157249315](https://www.openstreetmap.org/way/157249315), version 5 |
| Extracted | 2026-08-10 via the Overpass API |
| Source tags | `name=Pista do Kartódromo de Baltar`, `highway=raceway`, `sport=karting`, `surface=asphalt` |
| Local origin | lat 41.187001, lon -8.395940 |
| Centerline length | 1002 m over 92 points |
| Travel direction | Derived from OSM node order. **Not verified** against the venue's actual racing direction. |
| Track width | 8.0 m — **estimate**, not sourced. |
| Privacy | Public infrastructure geometry only. No telemetry, imagery, or personal data. |

### Circuits deliberately not imported

Kartódromo Internacional Ayrton Senna is mapped as `leisure=sports_centre` — the
site boundary, not the driving surface — and its kart circuit exists only as
loose open ways interleaved with the neighbouring car circuit's segments.
Stitching those into a closed loop would be guesswork, so it was left out.
Prefer a way tagged `highway=raceway` with `sport=karting`: a facility polygon
traces the fence, not the racing line.

### What these files are not

They are the mapped edge of a driving surface, resampled. They are not a survey,
not a homologation drawing, and not accurate enough for a predicted lap time to
be compared with a published record without stating the geometric error first.
The `kart` block in each file is a placeholder copied from the synthetic
example, not the machinery that races at that venue.
