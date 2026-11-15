# AstroLens

A 3D space web page: upload a photo of a planet, nebula or star cluster, and AstroLens recognises it, flies the camera to it, shows a short fact card, and answers questions from NASA and Wikipedia texts with sources.

College project for CSE471 (Computer Vision) and CSE472 (NLP). Plan: [PLAN.md](PLAN.md). Report: [REPORT.md](REPORT.md).

> Status: Phase 0 (setup). Live link, demo video and results come in later phases.

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
```

Copy `.env.example` to `.env` and add a free Groq API key for the chat.

## Data sources

See [ml/data/SOURCES.md](ml/data/SOURCES.md).
