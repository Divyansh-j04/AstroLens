# Sources

Every fact, coordinate and dataset used by AstroLens, with where it came from and its licence.

## Object facts (`backend/app/data/objects.json`)

Retrieved Nov 16, 2026. Raw downloads are kept locally in `ml/data/raw/reference/` (not committed).

| What | Source | Licence |
| --- | --- | --- |
| Sky coordinates (RA, Dec) of the 10 deep-space objects | SIMBAD via the CDS Sesame name resolver, `https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/S?<name>` (queried as M42, M1, M57, M16, NGC3372, Barnard33, M45, M44, M13, NGC5139) | SIMBAD data, free for research and education; cite Wenger et al. 2000, A&AS 143, 9 |
| Distances, sizes, ages, brightness, constellations of deep-space objects | Wikipedia infobox of each object's article (link in that object's `sources`) | CC BY-SA 4.0 |
| Planet radius, orbit, day length, temperature, moons; Sun and Moon data | Wikipedia infobox of each body's article (link in `sources`), which cites NASA/JPL fact sheets | CC BY-SA 4.0 |
| Background reading linked on each card | NASA Science pages (`science.nasa.gov`), checked to load on Nov 16, 2026 | Public domain (NASA) |

Notes:
- Distances are rounded central values; Wikipedia gives uncertainties (for example the Crab Nebula is 6,500 ± 1,600 ly).
- `orbit_au` for Mars, Jupiter, Saturn and Uranus was converted from the km value in the infobox using 1 AU = 149,597,870.7 km.
- Moon counts change as new moons are confirmed, so they are marked "as of 2026".
- Card summaries are short paraphrases of the cited articles, written in plain language.

## Star catalogue (`frontend/public/data/hyg_stars.json`)

| What | Source | Licence |
| --- | --- | --- |
| 8,834 naked-eye stars (magnitude below 6.5): position, magnitude, colour index | HYG Database v4.1, `https://github.com/astronexus/HYG-Database` (`hyg/CURRENT/hygdata_v41.csv`) | CC BY-SA 4.0 |

Built with `python ml/scripts/build_stars.py ml/data/raw/hyg/hyg.csv frontend/public/data/hyg_stars.json`.

## Training images (Phase 2)

To be filled in Phase 2: one row per image source, with licence.
