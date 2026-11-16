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

Source: `ml/results/dataset_counts.json`, written by `ml/scripts/split.py`. Sources and licences: `ml/data/SOURCES.md`.

- **Collection.** Candidate images came from Wikimedia Commons (`ml/scripts/collect.py`) and from six space-agency archives: ESA/Hubble, ESA/Webb, NOIRLab, ESO, NASA/JPL Photojournal and NASA DSCOVR EPIC (`ml/scripts/topup.py`). Deep-sky classes were also searched by catalogue name (M42, NGC 1976, M1, M16, NGC 3372, and so on).
- **Licences.** Only public domain, CC0, CC BY, CC BY-SA and NASA images were used (`ml/scripts/licences.py`); 54 candidates were left out for their licence.
- **Review by eye.** Every candidate was checked on numbered contact sheets (`ml/scripts/review_sheets.py`). Each rejection is logged with its reason in `ml/data/review_excluded.csv`: charts, labelled panels, collages, artwork, the wrong object, near-black frames, and close-ups too zoomed in to recognise. Recognisable close-ups were kept and tagged in `ml/data/review_closeups.csv`: Jupiter's Great Red Spot, Saturn's rings, sunspots, the Pillars of Creation, Carina's Cosmic Cliffs. Close-ups are at most 30% of a class, or 60% for classes under 80 images.
- **Duplicates.** Each image is described by the EfficientNet-B0 ImageNet features and compared with cosine similarity:
  - 0.985 or more: the same picture, so only one copy is kept.
  - 0.95 or more: versions of one picture (other crops or colours). They are kept, but always in the same part of the split, so a picture cannot be in both training and test.
  - In all, 233 images fell into such groups, and 0 groups spanned two classes.
- **Split.** 70 / 15 / 15 by group, with a fixed seed per class, done separately for whole-object and close-up images. The split is one list, `ml/data/split.csv`. At most 150 images per class.
- **Classes left out.** Six objects could not reach 50 usable free-licence images, so they are left out of the classifier: Ring Nebula, Horsehead Nebula, Pleiades, Beehive Cluster, M13 and Omega Centauri. They stay in the 3D scene, the cards and the chat. The classifier has 14 classes.

| Stage | Images |
| --- | --- |
| Candidates downloaded | 4,144 |
| Kept after review | 1,723 |
| Left after removing duplicates | 1,599 |
| Used (after the 150 cap, close-up cap and left-out classes) | 1,401 (1,071 whole, 330 close-up) |
| Train / validation / test | 995 / 217 / 189 |

**Images per class**

| Class | Candidates | After review | After duplicates | Used | Whole | Close-up | Train | Val | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sun | 245 | 106 | 106 | 106 | 86 | 20 | 75 | 18 | 13 |
| Mercury | 322 | 179 | 176 | 82 | 33 | 49 | 59 | 12 | 11 |
| Venus | 289 | 86 | 84 | 84 | 79 | 5 | 60 | 13 | 11 |
| Earth | 224 | 99 | 99 | 98 | 69 | 29 | 70 | 14 | 14 |
| Moon | 260 | 92 | 92 | 92 | 87 | 5 | 65 | 14 | 13 |
| Mars | 457 | 117 | 111 | 111 | 97 | 14 | 78 | 18 | 15 |
| Jupiter | 449 | 210 | 204 | 150 | 105 | 45 | 106 | 23 | 21 |
| Saturn | 381 | 191 | 182 | 150 | 105 | 45 | 106 | 23 | 21 |
| Uranus | 330 | 108 | 76 | 76 | 76 | 0 | 54 | 12 | 10 |
| Neptune | 274 | 107 | 84 | 84 | 69 | 15 | 61 | 11 | 12 |
| Orion Nebula | 298 | 147 | 135 | 128 | 90 | 38 | 90 | 23 | 15 |
| Crab Nebula | 226 | 120 | 103 | 103 | 95 | 8 | 73 | 16 | 14 |
| Ring Nebula (left out: under 50) | 121 | 60 | 42 | 42 | 42 | 0 | 30 | 6 | 6 |
| Eagle Nebula | 146 | 68 | 62 | 62 | 27 | 35 | 44 | 9 | 9 |
| Carina Nebula | 243 | 93 | 85 | 75 | 53 | 22 | 54 | 11 | 10 |
| Horsehead Nebula (left out: under 50) | 17 | 13 | 13 | 13 | 9 | 4 | 10 | 2 | 1 |
| Pleiades (left out: under 50) | 21 | 8 | 8 | 8 | 6 | 2 | 7 | 1 | 0 |
| Beehive Cluster (left out: under 50) | 3 | 2 | 2 | 2 | 2 | 0 | 2 | 0 | 0 |
| Hercules Cluster (M13) (left out: under 50) | 8 | 6 | 6 | 6 | 4 | 2 | 5 | 1 | 0 |
| Omega Centauri (left out: under 50) | 31 | 14 | 14 | 14 | 8 | 6 | 11 | 2 | 1 |

## 6. Image classifier

Source: `ml/results/train_efficientnet_b0_aug.json` and `ml/results/train_efficientnet_b0_noaug.json`, written by `ml/scripts/train.py`. Model code: `backend/app/cv/classifier.py`.

- **Model.** EfficientNet-B0 with ImageNet weights (torchvision). Its last layer is replaced by a 14-class layer (transfer learning).
- **Stage 1, 5 epochs.** The backbone is frozen and only the new layer learns (AdamW, learning rate 3e-4).
- **Stage 2, up to 15 epochs.** All layers learn (AdamW, learning rate 1e-4 on a cosine decay).
- **Other settings.** Weight decay 1e-4, label smoothing 0.1, batch 32, input 224 x 224. Early stopping keeps the epoch with the lowest validation loss (patience 4).
- **Augmentation** (comparison run only). Random crops keeping 25-100% of the image (this also makes close-up-like views), horizontal and vertical flips, any rotation, colour jitter, and grey 10% of the time.
- **Runs.** Both on an NVIDIA RTX 4060 Laptop GPU with PyTorch 2.8.0: 20 epochs each, best epoch 18 in both, no early stop.
  - Without augmentation: 1.4 min, validation accuracy 92.6%.
  - With augmentation: 3.08 min, validation accuracy 88.0%.
  - Training curves: `ml/results/training_curve_efficientnet_b0_aug.png` and `..._noaug.png`.
- **Which model the app uses.** The model **without augmentation**, chosen on the validation set (see section 7). Its weights are `backend/weights/efficientnet_b0_noaug.pt`.
- **Confidence threshold.** Chosen on the validation set only: the 5th percentile of the top-1 confidence on correctly classified validation images, which is **0.46**. Below it, the answer is "not one of my known objects". The threshold is stored in `backend/app/data/classifier.json`.
- **Command-line check.** `python ml/scripts/predict.py photo.jpg` prints the top 3 guesses and the unknown message.

## 7. Classifier results

Source: `ml/results/metrics.json`, written once by `ml/scripts/evaluate.py` on the 189 test images, which were not used before this point.

**Table A: classifier results (test set)**

| Model | Top-1 accuracy % | Top-3 accuracy % | Macro F1 | Training time (min) |
| --- | --- | --- | --- | --- |
| EfficientNet-B0 without augmentation | 93.1 | 98.4 | 0.919 | 1.4 |
| EfficientNet-B0 with augmentation | 88.9 | 97.4 | 0.861 | 3.08 |

**Accuracy by view type (test set, top-1 / top-3 %)**

| Model | Whole objects (147) | Close-ups (42) | All (189) |
| --- | --- | --- | --- |
| Without augmentation | 92.5 / 98.0 | 95.2 / 100.0 | 93.1 / 98.4 |
| With augmentation | 88.4 / 96.6 | 90.5 / 100.0 | 88.9 / 97.4 |

**Choosing the app's model (validation set only).** The augmented model was first planned as the app's model. It scored lower on clean validation photos (88.0% against 92.6%), but augmentation is meant to help with messy real uploads. So both models were also scored on altered copies of the 217 validation photos, one change at a time. Source: `ml/results/robustness_val.json`, written by `ml/scripts/robustness.py`.

| Validation photos changed to | Imitates | Without augmentation | With augmentation |
| --- | --- | --- | --- |
| clean | the photo as it is | 92.6 | 88.0 |
| rotated 45 deg | a tilted phone or telescope shot | 86.2 | 87.6 |
| rotated 90 deg | a sideways photo | 83.4 | 88.0 |
| blurred | out of focus or atmospheric shake | 84.3 | 80.2 |
| darker (50%) | under-exposed | 91.2 | 88.0 |
| brighter (160%) | over-exposed | 86.2 | 84.3 |
| JPEG quality 10 | a heavily compressed chat-app image | 77.9 | 71.9 |
| low resolution (64 px) | a small or distant object, digitally zoomed | 74.7 | 75.1 |
| sensor noise | a grainy night-time phone photo | 60.4 | 54.4 |
| grey | a black-and-white photo | 83.4 | 80.6 |
| centre crop 50% | a zoomed-in close-up | 78.3 | 81.1 |
| **Average over the 10 altered versions** | | **80.6** | **79.1** |

- The model without augmentation won on clean photos and on 6 of the 10 altered versions: blur, darker, brighter, JPEG, noise and grey.
- The augmented model won on the changes it was trained with: rotation (it scores the same sideways as upright), tight crops and low resolution.
- One validation photo is about 0.5 points, so most gaps are a handful of photos.

The model without augmentation was chosen because it is better on clean photos and slightly better on average over the altered ones. The choice was made on validation photos only; the test set was not used to choose.

A likely reason augmentation did not pay off here: the validation and test images are clean archive photos, much like the training images. Its rotation and crop changes also did nothing for blur, noise or compression, which it never saw. 189 test images is also a small sample, where one image is about 0.5 points.

**Table B: per-class results (model without augmentation, the app's model, test set)**

| Class | Train images | Test images | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- |
| Sun | 75 | 13 | 0.929 | 1.0 | 0.963 |
| Mercury | 59 | 11 | 0.909 | 0.909 | 0.909 |
| Venus | 60 | 11 | 0.818 | 0.818 | 0.818 |
| Earth | 70 | 14 | 1.0 | 1.0 | 1.0 |
| Moon | 65 | 13 | 0.929 | 1.0 | 0.963 |
| Mars | 78 | 15 | 1.0 | 1.0 | 1.0 |
| Jupiter | 106 | 21 | 0.955 | 1.0 | 0.977 |
| Saturn | 106 | 21 | 1.0 | 0.952 | 0.976 |
| Uranus | 54 | 10 | 1.0 | 0.7 | 0.824 |
| Neptune | 61 | 12 | 0.786 | 0.917 | 0.846 |
| Orion Nebula | 90 | 15 | 0.882 | 1.0 | 0.938 |
| Crab Nebula | 73 | 14 | 1.0 | 0.857 | 0.923 |
| Ring Nebula | left out (42 usable images, under 50) | | | | |
| Eagle Nebula | 44 | 9 | 0.875 | 0.778 | 0.824 |
| Carina Nebula | 54 | 10 | 0.9 | 0.9 | 0.9 |
| Horsehead Nebula | left out (13 usable images, under 50) | | | | |
| Pleiades | left out (8 usable images, under 50) | | | | |
| Beehive Cluster | left out (2 usable images, under 50) | | | | |
| Hercules Cluster (M13) | left out (6 usable images, under 50) | | | | |
| Omega Centauri | left out (14 usable images, under 50) | | | | |

Average over the 14 classes: precision 0.927, recall 0.916, F1 0.919 (macro F1 from Table A).

**Confusion matrix** (app's model): `ml/results/confusion_matrix.png`. Only 13 of 189 test images are wrong, and no pair is confused more than twice:
- **Uranus taken for Neptune** (2). Both are small, nearly featureless blue-green discs, and processed images can make one look like the other.
- **Venus** (1 each taken for the Sun and the Moon, and 1 Mercury taken for Venus). Venus is a bright, featureless disc like the Sun in amateur photos, and its ultraviolet and radar images are grey and mottled like Mercury's or the Moon's surface.
- Every other mistake is a single image, for example Saturn taken for Neptune, Neptune for Jupiter, Eagle for Orion, and Uranus for Venus.

**Threshold on the test set:**
- 95.2% of test images are above the threshold, and 94.4% of those are right.
- 6 correct answers fall below the threshold, and 10 wrong answers are above it.

**Unknown-object test:** 66 photos of things outside the 14 classes (`ml/data/manifest_unknown.csv` and the "unknown" rows of `ml/data/manifest.csv`, reviewed by eye). The threshold rejected **40 of 66 (60.6%)**:

| Unknown type | Photos | Rejected |
| --- | --- | --- |
| Cats | 6 | 6 |
| Dogs | 6 | 6 |
| Mountains | 6 | 6 |
| Galaxies (Andromeda, Whirlpool, Sombrero) | 16 | 12 |
| Other nebulae (Lagoon, Helix, Tarantula) | 20 | 6 |
| Comets (NEOWISE and others) | 11 | 3 |
| Pluto | 1 | 1 |

All 18 everyday photos are rejected. Most galaxies are too, but most other nebulae and comets are not: the model gives them a confident guess among the nebulae it knows. One confidence threshold cannot separate "a nebula I know" from "a nebula I don't" well. (With the augmented model the same test rejected only 26 of 66, because its threshold, 0.36, was lower.)

Grad-CAM examples (6): _Phase 3_.

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
| 2 | Image collection from Wikimedia Commons and six space-agency archives, with a licence record for every image (`collect.py`, `topup.py`, manifests) | Done |
| 2 | Licence rule with tests (`ml/scripts/licences.py`, `tests/test_licences.py`) | Done |
| 2 | Review by eye with numbered contact sheets; every rejection logged with a reason (`review_sheets.py`) | Done |
| 2 | Deep-feature duplicate removal and a leak-free 70/15/15 split (`split.py`, `ml/data/split.csv`) | Done |
| 2 | EfficientNet-B0 trained with and without augmentation (`train.py`) | Done |
| 2 | Test-set evaluation: Table A, Table B, accuracy by view, confusion matrix, threshold, unknown test (`evaluate.py`, `ml/results/metrics.json`) | Done |
| 2 | `predict.py photo.jpg` prints the top 3 and the unknown message | Done |
| 2 | Classifier config for the server (`backend/app/data/classifier.json`); weights in `backend/weights/` (not committed) | Done |

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

- Only 20 objects, and the classifier knows 14 of them. Ring Nebula, Horsehead Nebula, Pleiades, Beehive Cluster, M13 and Omega Centauri had too few free-licence photos (under 50 after review) and are left out of the classifier; they are still in the scene and the chat.
- Several classes are below the planned 80 images (Uranus 76, Carina 75, Eagle 62), and the test set has only 9 to 21 images per class, so per-class scores move a lot with one image.
- Eagle Nebula leans on Pillars of Creation close-ups (35 of 62 images).
- Most images are processed archive pictures (Hubble, Webb, spacecraft). Phone or small-telescope photos look different and are likely to score lower.
- The unknown-object test rejects 60.6% of out-of-scope photos (`ml/results/metrics.json`). It rejects all 18 everyday photos, but other nebulae and comets mostly get a confident wrong guess (rejected 6 of 20 and 3 of 11).
- The app's model (without augmentation) is weaker on sideways photos: 83.4% on validation photos rotated 90 degrees, against 92.6% upright (`ml/results/robustness_val.json`). It is also weak on very grainy photos (60.4% with added sensor noise).
- The threshold also rejects 6 of the 189 correct test answers (they fall below 0.46).
- Holdout split only (no k-fold), so there are no confidence intervals on the scores.
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
| PyTorch | The deep-learning library that runs the model on the graphics card and learns its weights | Phase 2 |
| torchvision | PyTorch's image companion: it supplies EfficientNet-B0 with ImageNet weights and the image transforms (crop, flip, rotate) | Phase 2 |
| EfficientNet-B0 | A small, accurate image-recognition network (5.3 million weights) already trained on the 1.3 million photos of ImageNet | Phase 2 |
| Transfer learning | Start from a network that already knows edges, textures and shapes, and only teach it our classes, so a few hundred images are enough | Phase 2 |
| Data augmentation | Random crops, flips, rotations and colour changes applied to training images, so the model sees more variety than the raw photos | Phase 2 |
| Robustness check | Score a model on deliberately altered copies of photos (rotated, blurred, compressed, noisy) to see how it copes with messy real uploads | Phase 2 |
| AdamW, cosine schedule, label smoothing, early stopping | The optimiser that adjusts the weights; a learning rate that slowly falls; slightly softened targets so the model is not over-confident; and keeping the epoch with the best validation loss | Phase 2 |
| Cosine similarity of deep features | Two images are compared by the angle between their EfficientNet feature vectors; near 1 means the same picture, which is how duplicates were found | Phase 2 |
| scikit-learn | A standard machine-learning library; used here only to compute precision, recall, F1 and the confusion matrix | Phase 2 |
| Confusion matrix | A table of true class against predicted class; everything off the diagonal is a mistake, so it shows which classes get mixed up | Phase 2 |
| Matplotlib | Draws the training curves and the confusion matrix as PNG images | Phase 2 |
| NumPy | Fast arrays of numbers; used for the evaluation sums and percentiles | Phase 2 |
| NASA Images API, JPL Photojournal, DSCOVR EPIC | NASA's image search, its archive of spacecraft pictures (PIA numbers), and the daily whole-Earth photos from the DSCOVR satellite | Phase 2 |
| ESA/Hubble, ESA/Webb, NOIRLab, ESO archives | The image archives of the Hubble and Webb telescopes and of two ground observatories; all CC BY 4.0 | Phase 2 |

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
| Nov 16, 2026 | Duplicates found by cosine similarity of EfficientNet-B0 ImageNet features (0.985 = same picture, keep one; 0.95 = same group, same split), replacing the 64-bit difference hash tried first | The difference hash matched unrelated dark space images (1,515 false cross-class pairs, which would have removed about 750 good images); the feature similarity found no cross-class pairs, and needs no extra library |
| Nov 16, 2026 | Licence allowlist: public domain, CC0, CC BY, CC BY-SA and NASA; non-commercial, no-derivatives and copyrighted images left out | Free to use in a public demo and report with credit; one tested rule decides every image |
| Nov 16, 2026 | Extra images from space-agency archives (ESA/Hubble, ESA/Webb, NOIRLab, ESO, Photojournal, EPIC), with catalogue-name searches for deep-sky objects | Wikimedia Commons alone did not give enough usable photos of the outer planets and the nebulae, and kept rate-limiting |
| Nov 16, 2026 | Python's HTTPS check kept on; two missing intermediate certificates (Let's Encrypt, HARICA for ESO) added in `ml/data/certs/` after checking their fingerprints against the Windows-trusted roots | Fixes "certificate verify failed" without ever turning verification off |
| Nov 16, 2026 | Classes under 50 usable images are left out of the classifier (6 of 20), not padded with weak images | Too few images to train and test fairly; those objects stay in the scene and the chat |
| Nov 16, 2026 | Classes under 80 may use up to 60% close-ups, including zoomed views re-admitted only if they show most of the object and are easy to recognise | Gives short classes enough images without adding close-ups nobody could identify |
| Nov 16, 2026 | Split shuffled with a fixed seed per class | Adding images to one class no longer reshuffles every other class's split |
| Nov 16, 2026 | Holdout split (70/15/15) only, no k-fold | Simpler and fast; noted as a limitation |
| Nov 16, 2026 | Downloads run with a time limit and a `--only` option, saving the manifest as they go | A stopped run never loses licence records, and rate limits cannot make a run go on for hours |
| Nov 16, 2026 | The app uses the model **without** augmentation, chosen on the validation set: clean photos plus 10 altered versions (`ml/scripts/robustness.py`); Table A reports both models | It scored higher on clean validation photos (92.6% against 88.0%) and on average over the altered ones (80.6% against 79.1%). Choosing on validation, not test, keeps the test scores fair. The augmented model was the original plan |

## Progress log

- **Nov 16, 2026 (Phase 0):** Project set up outside OneDrive with git. objects.json written for all 20 objects (coordinates from SIMBAD, facts from Wikipedia and NASA), validated by 9 passing tests. Star file built with 8,834 stars. Server answers /health; page builds and serves with all frontend libraries. Groq test call answered in 616 ms with gpt-oss-20b. Phase 0 complete.
- **Nov 16, 2026 (Phase 1):** 3D scene built: HYG star field, textured Solar System with orbit rings, 10 deep-space pictures at their real RA/Dec, GSAP fly-to with mode-switch pull-back, glass panel with the brief card, Home button, loading screen and a temporary dropdown. 21 scene images were downloaded with their licences (`ml/scripts/fetch_scene_images.py`). The browser check passed for all 20 objects, plus the panel, Home, scene-click and sky-alignment checks, with 0 console errors (`ml/results/phase1_scene_check.json`). pytest: 12 passed. Phase 1 complete.
- **Nov 16, 2026 (Phase 2):**
  - **Dataset:** 4,144 candidates from Wikimedia Commons and six space-agency archives, all reviewed by eye. 1,401 images used in 14 classes (train 995, validation 217, test 189); six objects are left out of the classifier for having under 50 images.
  - **Training:** EfficientNet-B0 trained with and without augmentation on the RTX 4060 (3.08 and 1.4 min).
  - **Model choice:** the model without augmentation, chosen on validation photos, clean and altered (`ml/results/robustness_val.json`).
  - **Test set:** without augmentation, top-1 93.1%, top-3 98.4%, macro F1 0.919; with augmentation, 88.9%, 97.4% and 0.861.
  - **Threshold and unknowns:** the threshold is 0.46, and the unknown test rejected 40 of 66 (all 18 everyday photos).
  - **Done-when check:** `metrics.json` and `confusion_matrix.png` exist, and `predict.py` prints the top 3.
  - **Tests:** pytest, 30 passed. Phase 2 complete.
