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

## 12. References

_Completed in Phase 5. So far:_ HYG Database v4.1 (CC BY-SA 4.0); SIMBAD / CDS Sesame; Wikipedia articles and NASA Science pages listed in `ml/data/SOURCES.md`.

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

## Progress log

- **Nov 16, 2026 (Phase 0):** Project set up outside OneDrive with git. objects.json written for all 20 objects (coordinates from SIMBAD, facts from Wikipedia and NASA), validated by 9 passing tests. Star file built with 8,834 stars. Server answers /health; page builds and serves with all frontend libraries. Groq test call answered in 616 ms with gpt-oss-20b. Phase 0 complete.
