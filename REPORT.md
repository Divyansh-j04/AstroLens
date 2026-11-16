# AstroLens: Project Report

> Filled in phase by phase. Every number comes from a file in `ml/results/` written by a script, and the file is named next to the table. Empty cells mean that phase has not run yet.

## 1. Title

- **Project:** AstroLens: recognising celestial objects from photos, with a 3D explorer and a cited chat assistant
- **Author:** Divyansh (registration number: _to add_)
- **Courses:** CSE471 Computer Vision, CSE472 Natural Language Processing
- **Date:** _to add at submission_
- **Live link:** _Phase 5_
- **Repository:** _Phase 5_

## 2. Abstract

_Written in Phase 5 (about 150 words): problem, approach, headline results._

## 3. Problem and objectives

_Written in Phase 5._

## 4. System overview

_Written in Phase 5 from PLAN.md section 4 (page → server → classifier / chat → page)._

### 3D scene (Phase 1)

- **Placing deep-space objects from sky coordinates.** With right ascension α, declination δ (in radians) and distance d: x = d·cos δ·cos α, y = d·cos δ·sin α, z = d·sin δ (x points to α = 0h, z to the north celestial pole). Three.js uses y as "up", so the page uses (x, z, −y). Code: `frontend/src/scene/scale.js` (`skyToScene`).
- **Display distance.** Real distances run from 444 ly (Pleiades) to 24,100 ly (M13), so the page uses d = 4 × √(light-years): Pleiades 84 units, M13 621 units. Directions are exact; only distances are compressed.
- **Stars.** The 8,834 HYG stars keep their real direction but are drawn on a far sphere that moves with the camera, so they behave like a sky at infinity. Size comes from magnitude, colour from colour index (blue for hot stars, orange-red for cool ones).
- **Solar System.** Sizes and orbits are compressed with a square root: radius = 0.0075 × √(radius in km), orbit = 6 + 10 × √(AU). The Sun is fixed at radius 3 so it does not swallow Mercury. The page is labelled "not to scale".
- **Two scene modes.** Planets are light-minutes away and nebulae thousands of light-years away, so one camera view cannot show both. A fly-to into the other mode first pulls the camera back to that mode's overview over 2.5 s while the planets and nebula pictures cross-fade, then flies to the object.
- **Fly-to.** GSAP animates the camera position and its look-at point with an ease-in-out curve. A flight takes 1 + distance/400 seconds, clamped to 1.2 to 3 s. Mouse controls are locked during a flight. For a nebula or cluster, the camera stops on the line from Earth to the object, so the stars behind it are its real constellation.

## 5. Dataset

_Phase 2: images per class, sources and licences, how duplicates were removed, the 70/15/15 split._

## 6. Image classifier

_Phase 2: EfficientNet-B0, training settings, augmentation, training curve._

## 7. Classifier results

_Phase 2. Source: `ml/results/metrics.json`._

**Table A: classifier results**

| Model | Top-1 accuracy % | Top-3 accuracy % | Macro F1 | Training time (min) |
| --- | --- | --- | --- | --- |
| EfficientNet-B0 without augmentation |  |  |  |  |
| EfficientNet-B0 with augmentation |  |  |  |  |

**Table B: per-class results**

| Class | Train images | Test images | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- |
| Sun |  |  |  |  |  |
| Mercury |  |  |  |  |  |
| Venus |  |  |  |  |  |
| Earth |  |  |  |  |  |
| Moon |  |  |  |  |  |
| Mars |  |  |  |  |  |
| Jupiter |  |  |  |  |  |
| Saturn |  |  |  |  |  |
| Uranus |  |  |  |  |  |
| Neptune |  |  |  |  |  |
| Orion Nebula |  |  |  |  |  |
| Crab Nebula |  |  |  |  |  |
| Ring Nebula |  |  |  |  |  |
| Eagle Nebula |  |  |  |  |  |
| Carina Nebula |  |  |  |  |  |
| Horsehead Nebula |  |  |  |  |  |
| Pleiades |  |  |  |  |  |
| Beehive Cluster |  |  |  |  |  |
| Hercules Cluster (M13) |  |  |  |  |  |
| Omega Centauri |  |  |  |  |  |

Confusion matrix: _Phase 2_. Unknown-object test: _Phase 2_. Grad-CAM examples (6): _Phase 3_.

## 8. Chat and command matching

_Phase 4: texts used, chunk size, embedding model, index, language model, prompt rules._

## 9. Chat results

_Phase 4. Source: `ml/results/rag_eval.csv`._

**Table C: chat retrieval and answers**

| Measure | Result |
| --- | --- |
| Questions where the right source was in the top 5 (of 30) |  |
| Answers fully supported by the sources, manual check (of 10) |  |
| Unanswerable questions correctly refused (of 10) |  |
| Median answer time (seconds) |  |

**Table D: command matching**

| Phrase type | Phrases | Accuracy % |
| --- | --- | --- |
| Exact names | 15 |  |
| Nicknames | 15 |  |
| Typos or extra words | 10 |  |

## 10. Features delivered

| Phase | Feature | Status |
| --- | --- | --- |
| 0 | Project folders, CLAUDE.md, PLAN.md, REPORT.md, git repository | Done |
| 0 | `objects.json` with 20 objects, validated by a Pydantic schema and tests | Done |
| 0 | `hyg_stars.json`: 8,834 naked-eye stars from the HYG catalogue | Done |
| 0 | Server with `/health` and `/objects`, CORS, request timing log | Done |
| 0 | React + Vite page with Tailwind, React Three Fiber, drei, GSAP, Zustand installed | Done |
| 0 | Groq language model test call (`ml/scripts/check_llm.py`, model `openai/gpt-oss-20b`) | Done |
| 1 | Star field: 8,834 HYG stars, size by magnitude, colour by colour index | Done |
| 1 | Sun, 8 planets and Moon with textures, slow spin, thin orbit rings, Saturn's ring, "not to scale" note | Done |
| 1 | 6 nebulae and 4 clusters as glowing pictures (sprites) at their real RA/Dec, √distance scale | Done |
| 1 | Camera fly-to for all 20 objects; pull-back and cross-fade when the scene mode changes | Done |
| 1 | Glass side panel (26% wide, 14 px blur, collapsible) with the brief card from `objects.json` | Done |
| 1 | Card buttons: "Chat more" opens a placeholder chat view; "Top-3 guesses" is disabled until Phase 3; confidence badge slot is ready | Done (placeholders) |
| 1 | Mouse orbit when idle, locked during a flight; Home button; clickable planets and name labels; loading screen with a progress bar | Done |
| 1 | Temporary "Go to" dropdown of the 20 objects (to be replaced by upload and typed commands) | Done |
| 1 | Browser check script `frontend/scripts/check-phase1.mjs` and 20 screenshots in `ml/results/phase1_screens/` | Done |

**Phase 1 scene check.** Source: `ml/results/phase1_scene_check.json`, written by `node scripts/check-phase1.mjs` (run from `frontend/`). The script opened the page in Microsoft Edge 157 (headless) on the author's laptop, which used the real GPU (NVIDIA GeForce RTX 4060 Laptop GPU, through Direct3D 11). The viewport was 1440 × 900. The script picked each object in the dropdown, alternating Solar System and deep space, so 19 of the 20 flights were mode switches.

| Check | Result |
| --- | --- |
| Objects that flew to the planned viewpoint and showed the right card (name and summary), mode, cross-fade, object on screen, controls unlocked after | 20 of 20 |
| Largest camera position error after a flight (scene units) | 0 |
| Stars drawn | 8,834 |
| Frames per second, idle at the overview | 144 (the display's refresh rate) |
| Frames per second during flights, lowest of 20 | 135.5 |
| Mode-switch cross-fade duration | 2.51 to 2.52 s |
| Planet visibility during the first switch, sampled every 100 ms | falls smoothly 1 → 0.99 → 0.97 → … → 0.03 → 0.01 → 0 (no jump) |
| Whole flight into deep space, including the pull-back | 5.51 to 5.52 s |
| Whole flight back into the Solar System, including the pull-back | 3.73 to 3.87 s |
| Page load until the loading screen cleared | 2,226 ms (local development server) |
| Panel width as a share of the window | 0.26 |
| Panel collapse and reopen; "Chat more" view and back to the card | all pass |
| Home button (from deep space): Solar-System mode, camera at the overview, panel hidden | pass |
| Clicking each of the 10 Solar-System name labels, and the Sun's sphere itself | 11 of 11 |
| Angle between the Pleiades and the Crab Nebula as seen from the Sun (both in Taurus) | 24.9° |
| Pleiades to its nearest bright star (brighter than magnitude 4; Alcyone, mag 2.85) | 0.21° |
| Browser console errors | 0 |

The last two sky rows show that the nebula pictures and the HYG stars share one coordinate frame. The Pleiades picture sits 0.21° from a magnitude 2.85 star, which is Alcyone, the cluster's brightest star.

**Table E: time taken per step (deployed, median of 10 runs)**

| Step | ms |
| --- | --- |
| Upload and classify |  |
| Grad-CAM |  |
| Find paragraphs (search) |  |
| Language model answer |  |

## 11. Limitations and future work

- Only 20 classes; any other sky photo is outside scope.
- Nebulae are shown as flat images at their real sky position, not true 3D shapes.
- Planet sizes and distances are compressed and labelled "not to scale".
- Object distances are rounded central values; published uncertainties are large for some (Crab Nebula ± 1,600 ly).
- Planets do not move along their orbits; each sits at a fixed spot, and only spins slowly. Their positions round the Sun are spread out for display, not taken from a real date.
- The planets' orbit plane is drawn level with the celestial equator. The real ecliptic is tilted 23.4° from it.
- Stars are drawn at their real direction, but not at their real distance (they sit on a far sphere). The 3D view therefore does not show stars at different depths.
- Orion Nebula and Horsehead Nebula are only 3° apart on the sky, so their pictures overlap. That is true to the sky, but it can make one hard to click.
- The frame rates were measured on one laptop with a fast GPU (RTX 4060). Slower machines, and phones in particular, have not been measured yet (Phase 5).
- The chat view is a placeholder until Phase 4. "Top-3 guesses" stays disabled until the classifier exists (Phase 3).
- Future work (beyond this project): draw star clusters as 3D balls of star points instead of one picture, and give nebulae depth with a particle cloud built from the bright pixels of their photo.
- Future work (beyond this project): planets move along their orbits from the moment the page loads. Speeds come from each planet's period, run on a sped-up clock, because real speed is too slow to see (Earth moves about 1° a day). The motion pauses in deep-space mode, so the page does no orbit work while the planets are hidden, and resumes on return. The fly-to must then follow a moving planet: the camera keeps tracking it after landing.
- Future work (beyond this project): an OpenCV auto-crop before classification. It would find the bright disc in photos where the Moon or a planet is small in the frame (thresholding or circle detection) and classify the crop. This adds a classic computer-vision step in front of the deep model.

## 12. References

_Completed in Phase 5. So far:_ HYG Database v4.1 (CC BY-SA 4.0); SIMBAD / CDS Sesame; Wikipedia articles and NASA Science pages listed in `ml/data/SOURCES.md`; planet, Sun and Moon textures by Solar System Scope (CC BY 4.0); nebula and cluster pictures from Wikimedia Commons (NASA/ESA, ESO, ESA/Webb and others; public domain, CC0, CC BY 4.0 or CC BY-SA 4.0), each credited in `ml/data/SOURCES.md`. Libraries used in Phase 1: Three.js 0.172, React Three Fiber 8.17, drei 9.120, GSAP 3.12, Zustand 5.0, playwright-core 1.56, Pillow 11.1.

## 13. Appendix

_Phase 4: the 30 test questions and 40 command phrases._

---

## Tools used (one sentence each)

| Tool | What it is | First used |
| --- | --- | --- |
| Python virtual environment (venv) | A private folder of Python libraries just for this project, so versions never clash with other projects | Phase 0 |
| FastAPI | A Python tool that turns functions into web endpoints the page can call | Phase 0 |
| Uvicorn | The program that actually runs the FastAPI server and listens for requests | Phase 0 |
| Pydantic | Checks that data has the right fields and types, and gives a clear error if not | Phase 0 |
| pytest | Runs small automatic checks to prove the code and data still work | Phase 0 |
| CORS | A browser rule; the server must say which web addresses may call it, or the browser blocks the request | Phase 0 |
| Vite | Runs the web page during development and bundles it for deployment | Phase 0 |
| React | Builds the page out of reusable pieces called components | Phase 0 |
| Tailwind CSS | Styling written as short class names, such as `flex` or `text-slate-300`, directly in the markup | Phase 0 |
| HYG Database | A free catalogue of about 120,000 stars with positions, brightness and colour | Phase 0 |
| SIMBAD | The standard astronomy database of named objects outside the Solar System, used for sky coordinates | Phase 0 |
| Groq | A free-tier service that runs open language models over the internet | Phase 0 (test call) |
| gpt-oss-20b | An open-weight language model released by OpenAI, run on Groq; it writes the chat answers from the paragraphs we give it | Phase 0 (test call) |
| Three.js | A JavaScript library that draws 3D shapes, textures and lights in the browser using the graphics card (WebGL) | Phase 1 |
| React Three Fiber | Lets us write the Three.js scene as React components, such as `<mesh>` and `<sprite>`, instead of long setup code | Phase 1 |
| drei | A set of ready-made React Three Fiber pieces; we use its mouse orbit controls, texture loader, HTML labels and loading progress | Phase 1 |
| GSAP | An animation library that moves a value smoothly from A to B over time; it moves the camera during a fly-to | Phase 1 |
| Zustand | A tiny shared memory for the page: one store holding the mode, chosen object, flight status and panel state | Phase 1 |
| Shader (GLSL) | A very short program that runs on the graphics card; ours draws each star as a soft dot of its own size and colour | Phase 1 |
| Sprite | A flat picture in a 3D scene that always turns to face the camera; used for nebulae and clusters | Phase 1 |
| Additive blending | Adds a picture's light on top of what is behind it, so black sky in a nebula photo becomes invisible | Phase 1 |
| Wikimedia Commons API | Wikipedia's media library; its API gives each image a resized copy plus its licence and author | Phase 1 |
| Pillow | A Python library for opening and saving images; used here to save every scene image as a real JPEG | Phase 1 |
| Playwright (playwright-core) | Drives a real web browser from a script: it clicks, waits and takes screenshots, so the fly-to check is automatic | Phase 1 |

## Decisions

| Date | Decision | Why |
| --- | --- | --- |
| Nov 16, 2026 | Lite+ plan: ML side kept simple (EfficientNet-B0 only, MiniLM + FAISS only, manual answer checks); frontend and backend use the full plan's stack; Grad-CAM added back | Every ML part stays explainable in the viva, while the demo keeps a polished 3D experience |
| Nov 16, 2026 | Python 3.12 instead of 3.11 | 3.11 is not installed; 3.14 is too new for PyTorch and FAISS; Google Colab also runs 3.12 |
| Nov 16, 2026 | React 18 with React Three Fiber 8 and drei 9 | React Three Fiber 9 needs React 19; the React 18 versions are stable and well documented |
| Nov 16, 2026 | `objects.json` lives only in `backend/app/data/`; the page imports that same file through a Vite alias (`@data`) | One copy of the facts, so nothing is typed twice |
| Nov 16, 2026 | Project lives at `C:\Users\Divyansh\Projects\astrolens`, outside OneDrive | OneDrive syncing `node_modules` and `.venv` is slow and can lock files |
| Nov 16, 2026 | Install ML libraries in the phase that needs them, not in Phase 0 | Faster setup; requirements.txt only lists what is actually used |
| Nov 16, 2026 | Language model: `openai/gpt-oss-20b` on Groq, set by `GROQ_MODEL` in `.env` | Groq no longer offers Llama chat models (the planned `llama-3.1-8b-instant` returned "model not found"); gpt-oss-20b is open-weight, fast and free-tier; `gpt-oss-120b` is the stronger fallback |
| Nov 16, 2026 | Star positions kept in parsecs as given by HYG; deep-space objects in light-years from objects.json | Each file keeps its source's units; the scene converts both in Phase 1 |
| Nov 16, 2026 | Stars drawn on a far sphere that follows the camera, keeping only their direction | Their true distances (1.3 to thousands of parsecs) would not fit the compressed scene; the sky still shows real constellations |
| Nov 16, 2026 | Square-root display scale for planet sizes, orbits and deep-space distances | One simple rule everywhere; keeps both Mercury and Neptune, and both the Pleiades and M13, on one screen |
| Nov 16, 2026 | Planets fixed on their orbits (slow spin only), spread out by the golden angle | A moving target would make the fly-to harder; no real date is needed |
| Nov 16, 2026 | Mode switch pull-back happens only when the scene mode changes; flights within one mode go straight | Simpler, and a planet-to-planet hop does not need to leave the Solar System |
| Nov 16, 2026 | Nebula and cluster pictures are each article's Wikipedia lead image, fetched by a script that also records the licence | Uses the link already in `objects.json`; every image is free-licensed and credited automatically |
| Nov 16, 2026 | Image script uses Python's built-in `urllib`, not `httpx` | Wikimedia refused httpx requests (HTTP 403) but accepted urllib; one fewer library |
| Nov 16, 2026 | Soft round edge on nebula pictures made in the browser (one canvas gradient used as an alpha mask), not by editing the image files | The images stay exactly as downloaded, and there is no image-editing step |
| Nov 16, 2026 | Saturn's ring is the one display extra keyed by id in the scene code (`RING_TEXTURES`) and is unlit | It is a picture, not a fact; a lit flat ring is nearly black because sunlight hits it edge-on |
| Nov 16, 2026 | Store has one extra field, `flyRequest`, a counter | Lets Home or the same object be requested twice; the six planned fields are unchanged |
| Nov 16, 2026 | Planet and nebula fades live in a plain shared object (`scene/fade.js`), not in Zustand | They change 60 times a second during a switch; putting them in the store would re-render the page every frame |
| Nov 16, 2026 | Fly-to evidence collected with playwright-core driving the installed Edge | No browser download; it checks the real page and the real GPU, and writes a results file instead of relying on screenshots alone |
| Nov 16, 2026 | Training runs locally on the author's RTX 4060 GPU instead of Google Colab | Same script, no uploading data or downloading weights; `train.py` still runs unchanged on Colab |
| Nov 16, 2026 | The train/validation/test split is one list (`ml/data/split.csv`) rather than three image folders | Nothing is copied, the split is committed and reproducible (fixed seed), and anyone can check no image is in two parts |
| Nov 16, 2026 | Training images come from Wikimedia Commons categories, sampled per source with a cap | Commons gives a licence and author for every file; the cap stops one huge source (2,211 JunoCam frames) crowding out whole-planet photos |
| Nov 16, 2026 | Keep identifiable close-ups (Great Red Spot, Saturn's rings, Pillars of Creation, sunspots), tagged as "close-up", at most 30% of a class; drop ambiguous ones (crater fields, featureless haze) | Users often share a famous feature rather than the whole object; capping and tagging keeps whole-object accuracy measurable |
| Nov 16, 2026 | Zoom-in augmentation: random crops keep 25-100% of the image (wider than the planned 60-100%) | Turns whole-object photos into close-up-like training views at no data cost |
| Nov 16, 2026 | Test accuracy reported separately for whole objects, close-ups and all images | A single blended number would hide whether close-ups lowered accuracy on whole objects |
| Nov 16, 2026 | Near-duplicates found with a 64-bit difference hash written in a few lines (Pillow + NumPy), not the `imagehash` library | One fewer dependency, and the method is short enough to explain line by line |

## Progress log

- **Nov 16, 2026 (Phase 0):** Project set up outside OneDrive with git. objects.json written for all 20 objects (coordinates from SIMBAD, facts from Wikipedia and NASA), validated by 9 passing tests. Star file built with 8,834 stars. Server answers /health; page builds and serves with all frontend libraries. Groq test call answered in 616 ms with gpt-oss-20b. Phase 0 complete.
- **Nov 16, 2026 (Phase 1):** 3D scene built: HYG star field, textured Solar System with orbit rings, 10 deep-space pictures at their real RA/Dec, GSAP fly-to with mode-switch pull-back, glass panel with the brief card, Home button, loading screen and a temporary dropdown. 21 scene images were downloaded with their licences (`ml/scripts/fetch_scene_images.py`). The browser check passed for all 20 objects, plus the panel, Home, scene-click and sky-alignment checks, with 0 console errors (`ml/results/phase1_scene_check.json`). pytest: 12 passed. Phase 1 complete.
- **Nov 16, 2026 (Phase 2, in progress, checkpoint):**
  - **Collection:** candidate images collected from Wikimedia Commons, JPL Photojournal, ESA/Hubble, ESA/Webb, NOIRLab and NASA DSCOVR EPIC. There are 3,324 images on disk, plus 48 unknown-object test photos. Every image downloaded so far has been reviewed by eye, and every rejection is logged with its reason in `ml/data/review_excluded.csv`.
  - **Not done yet:** the Wikimedia downloads for Neptune, the nebulae, the clusters and the Wikimedia unknown photos, which were rate-limited.
  - **Manifest:** `manifest.csv` must be rebuilt by re-running `collect.py`. Wikimedia HTTPS now works through two verified Let's Encrypt link certificates in `ml/data/certs/`.
  - **Duplicates:** the deep-feature duplicate grouping (threshold 0.95) has been added to `split.py`.
  - **Not run yet:** training, evaluation and the split.
  - **Waiting on:** the author's decision about classes below 80 images, once the final counts are known.
