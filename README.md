# AstroLens

A 3D space web page: upload a photo of a planet, nebula or star cluster, and AstroLens recognises it, flies the camera to it, shows a short fact card, and answers questions from NASA and Wikipedia texts with sources.

College project for CSE471 (Computer Vision) and CSE472 (NLP). Plan: [PLAN.md](PLAN.md). Report: [REPORT.md](REPORT.md).

> Status: Phase 1 done: the 3D scene, camera fly-to and fact card work for all 20 objects (pick one from the temporary "Go to" list). Photo upload, chat, live link and results come in later phases.

## Run locally

Requirements: Python 3.12, Node.js 22.

```powershell
# Server
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend; uvicorn app.main:app --reload      # http://localhost:8000/health

# Page (second terminal)
cd frontend; npm install; npm run dev          # http://localhost:5173

# Tests
pytest tests

# Phase 1 browser check (from frontend/; uses the installed Microsoft Edge)
node scripts/check-phase1.mjs                  # writes ml/results/phase1_scene_check.json
```

Copy `.env.example` to `.env` and add a free Groq API key for the chat.

## Data sources

See [ml/data/SOURCES.md](ml/data/SOURCES.md).

**Image credits.** Planet, Sun and Moon textures by [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0). Nebula and cluster pictures come from Wikimedia Commons (NASA/ESA, ESO, ESA/Webb, Harel Boren, Chuck Ayoub), under public domain, CC0, CC BY 4.0 or CC BY-SA 4.0. The full credit for each file is in [ml/data/SOURCES.md](ml/data/SOURCES.md#scene-images-frontendpublictextures).

The 3D scene is **not to scale**: sizes and distances are compressed with a square root, and sky directions are real.
