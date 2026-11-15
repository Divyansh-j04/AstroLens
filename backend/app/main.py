"""AstroLens API server.

Phase 0: /health and /objects. Later phases add /classify, /navigate and /chat.
Run from the backend folder:  uvicorn app.main:app --reload
"""

import logging
import os
import time
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import HealthResponse, ObjectCatalogue, SpaceObject

DATA_DIR = Path(__file__).parent / "data"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("astrolens")


@lru_cache
def load_objects() -> list[SpaceObject]:
    """Read and validate objects.json once; every request reuses the result."""
    text = (DATA_DIR / "objects.json").read_text(encoding="utf-8")
    return ObjectCatalogue.model_validate_json(text).root


app = FastAPI(title="AstroLens API", version="0.1.0")

# CORS: lets the web page (a different address) call this server from the browser.
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    log.info("%s %s -> %d in %.1f ms", request.method, request.url.path, response.status_code, ms)
    return response


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", objects=len(load_objects()), model=None)


@app.get("/objects", response_model=list[SpaceObject])
def objects() -> list[SpaceObject]:
    return load_objects()
