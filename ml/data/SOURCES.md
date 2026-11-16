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

## Scene images (`frontend/public/textures/`)

Retrieved Nov 16, 2026 with `python ml/scripts/fetch_scene_images.py`, which also printed this table. Planet, Sun and Moon maps are by Solar System Scope (solarsystemscope.com), mirrored on Wikimedia Commons. Each nebula and cluster picture is the lead image of the Wikipedia article linked in that object's `sources`. All are free licences; CC BY and CC BY-SA images need the credit below, which the README links to.

| File | Commons source | Author | Licence |
| --- | --- | --- | --- |
| `sun.jpg` | [Solarsystemscope texture 2k sun.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_sun.jpg) | Solar System Scope | CC BY 4.0 |
| `mercury.jpg` | [Solarsystemscope texture 2k mercury.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_mercury.jpg) | Solar System Scope | CC BY 4.0 |
| `venus.jpg` | [Solarsystemscope texture 2k venus atmosphere.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_venus_atmosphere.jpg) | Solar System Scope | CC BY 4.0 |
| `earth.jpg` | [Solarsystemscope texture 2k earth daymap.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_earth_daymap.jpg) | Solar System Scope | CC BY 4.0 |
| `moon.jpg` | [Solarsystemscope texture 2k moon.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_moon.jpg) | Solar System Scope | CC BY 4.0 |
| `mars.jpg` | [Solarsystemscope texture 2k mars.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_mars.jpg) | Solar System Scope | CC BY 4.0 |
| `jupiter.jpg` | [Solarsystemscope texture 2k jupiter.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_jupiter.jpg) | Solar System Scope | CC BY 4.0 |
| `saturn.jpg` | [Solarsystemscope texture 2k saturn.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_saturn.jpg) | Solar System Scope | CC BY 4.0 |
| `uranus.jpg` | [Solarsystemscope texture 2k uranus.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_uranus.jpg) | Solar System Scope | CC BY 4.0 |
| `neptune.jpg` | [Solarsystemscope texture 2k neptune.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_neptune.jpg) | Solar System Scope | CC BY 4.0 |
| `orion_nebula.jpg` | [Orion Nebula - Hubble 2006 mosaic 18000.jpg](https://commons.wikimedia.org/wiki/File:Orion_Nebula_-_Hubble_2006_mosaic_18000.jpg) | NASA, ESA, M. Robberto (Space Telescope Science Institute/ESA) and the Hubble Space Telescope Orion Treasury Project Tea | Public domain |
| `crab_nebula.jpg` | [Crab Nebula.jpg](https://commons.wikimedia.org/wiki/File:Crab_Nebula.jpg) | NASA, ESA, J. Hester and A. Loll (Arizona State University) | Public domain |
| `ring_nebula.jpg` | [Webb captures detailed beauty of Ring Nebula (NIRCam image) (weic2320b).jpg](https://commons.wikimedia.org/wiki/File:Webb_captures_detailed_beauty_of_Ring_Nebula_(NIRCam_image)_(weic2320b).jpg) | ESA/Webb, NASA, CSA, M. Barlow, N. Cox, R. Wesson | CC BY 4.0 |
| `eagle_nebula.jpg` | [Eagle Nebula from ESO.jpg](https://commons.wikimedia.org/wiki/File:Eagle_Nebula_from_ESO.jpg) | ESO | CC BY 4.0 |
| `carina_nebula.jpg` | [Carina Nebula by Harel Boren (151851961, modified).jpg](https://commons.wikimedia.org/wiki/File:Carina_Nebula_by_Harel_Boren_(151851961,_modified).jpg) | Harel Boren | CC BY-SA 4.0 |
| `horsehead_nebula.jpg` | [Nebulosa testa di cavallo con SPECULOOS.jpg](https://commons.wikimedia.org/wiki/File:Nebulosa_testa_di_cavallo_con_SPECULOOS.jpg) | ESO | CC BY 4.0 |
| `pleiades.jpg` | [Pleiades large.jpg](https://commons.wikimedia.org/wiki/File:Pleiades_large.jpg) | NASA, ESA, AURA/Caltech, Palomar Observatory  The science team consists of: D. Soderblom and E. Nelan (STScI), F. Benedi | Public domain |
| `beehive_cluster.jpg` | [M44-Star-Cluster.png](https://commons.wikimedia.org/wiki/File:M44-Star-Cluster.png) | Chuck Ayoub | CC0 |
| `hercules_cluster.jpg` | [M13-Globular-Cluster.png](https://commons.wikimedia.org/wiki/File:M13-Globular-Cluster.png) | Chuck Ayoub | CC0 |
| `omega_centauri.jpg` | [Omega Centauri Stars.png](https://commons.wikimedia.org/wiki/File:Omega_Centauri_Stars.png) | Chuck Ayoub | CC0 |
| `saturn_ring.png` | [Solarsystemscope texture 2k saturn ring alpha.png](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_saturn_ring_alpha.png) | Solar System Scope | CC BY 4.0 |

## Training images (Phase 2)

Retrieved Nov 15-16, 2026. Every image's title, page link, author and licence is in `ml/data/manifest.csv` (Wikimedia Commons) or `ml/data/manifest_topup.csv` (space-agency archives); `ml/data/manifest_unknown.csv` lists the unknown-object test photos. The images themselves are not committed. Counts are the 1,401 images used for training, validation and testing (`ml/data/split.csv`).

**Licence rule** (`ml/scripts/licences.py`, tested in `tests/test_licences.py`): only public domain, CC0, CC BY and CC BY-SA are used, plus NASA/JPL Photojournal images whose credit is NASA or JPL with no copyright notice. Non-commercial (NC), no-derivatives (ND), "all rights reserved" and copyrighted images are left out.

| Source | How it was searched | Images used | Licence |
| --- | --- | --- | --- |
| Wikimedia Commons | Categories and searches per class in `ml/data/collect_sources.json` (`ml/scripts/collect.py`) | 974 | Public domain 308, CC BY 2.0 272, CC BY-SA 4.0 125, CC BY 4.0 116, CC0 57, CC BY-SA 3.0 36, CC BY-SA 2.0 30, CC BY 3.0 25, CC BY-SA 3.0 IGO 4, CC BY 2.5 1 |
| ESA/Hubble (`esahubble.org`) | Archive searches in `ml/data/topup_sources.json` (`ml/scripts/topup.py`) | 158 | CC BY 4.0 |
| NASA/JPL Photojournal (`science.nasa.gov/photojournal`), found through the NASA Images API by PIA number | same | 143 | NASA images, not copyrighted |
| NASA DSCOVR EPIC (`epic.gsfc.nasa.gov`), whole-Earth photos | same | 39 | Public domain (NASA) |
| NOIRLab (`noirlab.edu`) | same | 37 | CC BY 4.0 |
| ESO (`eso.org`) | same | 30 | CC BY 4.0 |
| ESA/Webb (`esawebb.org`) | same | 20 | CC BY 4.0 |

Credit line for the archive images, as the licences ask: NASA, ESA, ESO, NOIRLab/NSF/AURA, ESA/Webb and the individual authors named in the manifests.

## Chat texts (Phase 4)

Retrieved 2026-11-16 by `ml/scripts/collect_texts.py` (source list: each object's `sources` in `objects.json` plus `ml/data/text_sources.json`). Each text is kept in `backend/app/data/corpus/<object_id>/` with its title, link, licence and date at the top, and the chat cites it by that title and link. 76 documents, 195,241 words (`ml/results/corpus_counts.json`).

| Source | Documents | Licence |
| --- | --- | --- |
| English Wikipedia | 33 | CC BY-SA 4.0 (Wikipedia contributors); reference lists and "See also" sections removed |
| Simple English Wikipedia | 16 | CC BY-SA 4.0 (Wikipedia contributors) |
| NASA Science (`science.nasa.gov`) | 27 | Public domain (NASA; not copyrighted in the United States) |

Simple English Wikipedia has no article for the Ring Nebula, Eagle Nebula, Beehive Cluster or M13; those objects have 3 documents each.

| Object | Documents | Words | Texts |
| --- | --- | --- | --- |
| Sun | 4 | 14,940 | [Wikipedia: Sun](https://en.wikipedia.org/wiki/Sun); [NASA Science: Sun](https://science.nasa.gov/sun/); [Simple English Wikipedia: Sun](https://simple.wikipedia.org/wiki/Sun); [NASA Science: Sun: Facts](https://science.nasa.gov/sun/facts/) |
| Mercury | 4 | 10,727 | [Wikipedia: Mercury (planet)](https://en.wikipedia.org/wiki/Mercury_(planet)); [NASA Science: Mercury](https://science.nasa.gov/mercury/); [Simple English Wikipedia: Mercury (planet)](https://simple.wikipedia.org/wiki/Mercury_(planet)); [NASA Science: Mercury: Facts](https://science.nasa.gov/mercury/facts/) |
| Venus | 4 | 12,869 | [Wikipedia: Venus](https://en.wikipedia.org/wiki/Venus); [NASA Science: Venus](https://science.nasa.gov/venus/); [Simple English Wikipedia: Venus](https://simple.wikipedia.org/wiki/Venus); [NASA Science: Venus: Facts](https://science.nasa.gov/venus/facts/) |
| Earth | 4 | 18,684 | [Wikipedia: Earth](https://en.wikipedia.org/wiki/Earth); [NASA Science: Earth](https://science.nasa.gov/earth/); [Simple English Wikipedia: Earth](https://simple.wikipedia.org/wiki/Earth); [NASA Science: Facts About Earth](https://science.nasa.gov/earth/facts/) |
| Moon | 4 | 17,059 | [Wikipedia: Moon](https://en.wikipedia.org/wiki/Moon); [NASA Science: Earth's Moon](https://science.nasa.gov/moon/); [Simple English Wikipedia: Moon](https://simple.wikipedia.org/wiki/Moon); [NASA Science: Moon Facts](https://science.nasa.gov/moon/facts/) |
| Mars | 4 | 14,518 | [Wikipedia: Mars](https://en.wikipedia.org/wiki/Mars); [NASA Science: Mars](https://science.nasa.gov/mars/); [Simple English Wikipedia: Mars](https://simple.wikipedia.org/wiki/Mars); [NASA Science: Mars: Facts](https://science.nasa.gov/mars/facts/) |
| Jupiter | 4 | 12,268 | [Wikipedia: Jupiter](https://en.wikipedia.org/wiki/Jupiter); [NASA Science: Jupiter](https://science.nasa.gov/jupiter/); [Simple English Wikipedia: Jupiter](https://simple.wikipedia.org/wiki/Jupiter); [NASA Science: Jupiter Facts](https://science.nasa.gov/jupiter/facts/) |
| Saturn | 4 | 9,205 | [Wikipedia: Saturn](https://en.wikipedia.org/wiki/Saturn); [NASA Science: Saturn](https://science.nasa.gov/saturn/); [Simple English Wikipedia: Saturn](https://simple.wikipedia.org/wiki/Saturn); [NASA Science: Saturn: Facts](https://science.nasa.gov/saturn/facts/) |
| Uranus | 4 | 11,753 | [Wikipedia: Uranus](https://en.wikipedia.org/wiki/Uranus); [NASA Science: Uranus](https://science.nasa.gov/uranus/); [Simple English Wikipedia: Uranus](https://simple.wikipedia.org/wiki/Uranus); [NASA Science: Uranus: Facts](https://science.nasa.gov/uranus/facts/) |
| Neptune | 4 | 11,164 | [Wikipedia: Neptune](https://en.wikipedia.org/wiki/Neptune); [NASA Science: Neptune](https://science.nasa.gov/neptune/); [Simple English Wikipedia: Neptune](https://simple.wikipedia.org/wiki/Neptune); [NASA Science: Neptune: Facts](https://science.nasa.gov/neptune/facts/) |
| Orion Nebula | 4 | 4,282 | [Wikipedia: Orion Nebula](https://en.wikipedia.org/wiki/Orion_Nebula); [NASA Science: Messier 42 (The Orion Nebula)](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-42/); [Simple English Wikipedia: Orion nebula](https://simple.wikipedia.org/wiki/Orion_nebula); [Wikipedia: Trapezium Cluster](https://en.wikipedia.org/wiki/Trapezium_Cluster) |
| Crab Nebula | 5 | 13,447 | [Wikipedia: Crab Nebula](https://en.wikipedia.org/wiki/Crab_Nebula); [NASA Science: Messier 1 (The Crab Nebula)](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-1/); [Simple English Wikipedia: Crab Nebula](https://simple.wikipedia.org/wiki/Crab_Nebula); [Wikipedia: Crab Pulsar](https://en.wikipedia.org/wiki/Crab_Pulsar); [Wikipedia: SN 1054](https://en.wikipedia.org/wiki/SN_1054) |
| Ring Nebula | 3 | 4,442 | [Wikipedia: Ring Nebula](https://en.wikipedia.org/wiki/Ring_Nebula); [NASA Science: Messier 57 (The Ring Nebula)](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-57/); [Wikipedia: Planetary nebula](https://en.wikipedia.org/wiki/Planetary_nebula) |
| Eagle Nebula | 3 | 2,260 | [Wikipedia: Eagle Nebula](https://en.wikipedia.org/wiki/Eagle_Nebula); [NASA Science: Messier 16 (The Eagle Nebula)](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-16/); [Wikipedia: Pillars of Creation](https://en.wikipedia.org/wiki/Pillars_of_Creation) |
| Carina Nebula | 4 | 10,955 | [Wikipedia: Carina Nebula](https://en.wikipedia.org/wiki/Carina_Nebula); [Simple English Wikipedia: Carina nebula](https://simple.wikipedia.org/wiki/Carina_nebula); [Wikipedia: Eta Carinae](https://en.wikipedia.org/wiki/Eta_Carinae); [Wikipedia: Mystic Mountain](https://en.wikipedia.org/wiki/Mystic_Mountain) |
| Horsehead Nebula | 4 | 1,271 | [Wikipedia: Horsehead Nebula](https://en.wikipedia.org/wiki/Horsehead_Nebula); [Simple English Wikipedia: Horsehead nebula](https://simple.wikipedia.org/wiki/Horsehead_nebula); [Wikipedia: IC 434](https://en.wikipedia.org/wiki/IC_434); [Wikipedia: Dark nebula](https://en.wikipedia.org/wiki/Dark_nebula) |
| Pleiades | 4 | 9,500 | [Wikipedia: Pleiades](https://en.wikipedia.org/wiki/Pleiades); [NASA Science: Messier 45 (The Pleiades)](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-45/); [Simple English Wikipedia: Pleiades](https://simple.wikipedia.org/wiki/Pleiades); [Wikipedia: Pleiades in folklore and literature](https://en.wikipedia.org/wiki/Pleiades_in_folklore_and_literature) |
| Beehive Cluster | 3 | 5,580 | [Wikipedia: Beehive Cluster](https://en.wikipedia.org/wiki/Beehive_Cluster); [NASA Science: Messier 44](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-44/); [Wikipedia: Open cluster](https://en.wikipedia.org/wiki/Open_cluster) |
| Hercules Cluster (M13) | 3 | 3,313 | [Wikipedia: Messier 13](https://en.wikipedia.org/wiki/Messier_13); [NASA Science: Messier 13 (The Hercules Cluster)](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-13/); [Wikipedia: Arecibo message](https://en.wikipedia.org/wiki/Arecibo_message) |
| Omega Centauri | 3 | 7,004 | [Wikipedia: Omega Centauri](https://en.wikipedia.org/wiki/Omega_Centauri); [Simple English Wikipedia: Omega Centauri](https://simple.wikipedia.org/wiki/Omega_Centauri); [Wikipedia: Globular cluster](https://en.wikipedia.org/wiki/Globular_cluster) |

**Embedding model:** `sentence-transformers/all-MiniLM-L6-v2` (Apache 2.0), revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, downloaded from Hugging Face.
