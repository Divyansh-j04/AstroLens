"""AstroLens API server.

Phase 0: /health and /objects. Phase 3: /classify. Phase 4: /chat and /navigate.
Run from the backend folder:  uvicorn app.main:app --reload
"""

import io
import logging
import os
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError

from app.schemas import (
    Candidate,
    ChatRequest,
    ChatResponse,
    ClassifyResponse,
    ErrorResponse,
    Guess,
    HealthResponse,
    NavigateRequest,
    NavigateResponse,
    ObjectCatalogue,
    SpaceObject,
)

DATA_DIR = Path(__file__).parent / "data"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB
MAX_PIXELS = 40_000_000  # refuse absurdly large images (e.g. 10,000 x 10,000) before decoding them

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("astrolens")


@lru_cache
def load_objects() -> list[SpaceObject]:
    """Read and validate objects.json once; every request reuses the result."""
    text = (DATA_DIR / "objects.json").read_text(encoding="utf-8")
    return ObjectCatalogue.model_validate_json(text).root


@lru_cache
def get_classifier():
    """Load the trained model once (on the CPU, as on the deployed server). None if no weights are installed."""
    from app.cv.classifier import CONFIG_FILE, WEIGHTS_DIR, Classifier

    try:
        config_ok = CONFIG_FILE.exists()
        clf = Classifier(device="cpu") if config_ok else None
    except FileNotFoundError:
        clf = None
    if clf is None:
        log.warning("no classifier: run ml/scripts/train.py and evaluate.py (weights go in %s)", WEIGHTS_DIR)
        return None
    clf.predict(Image.new("RGB", (256, 256)))  # warm-up, so the first real upload is not slow
    log.info("classifier %s loaded: %d classes, threshold %.2f", clf.name, len(clf.classes), clf.threshold)
    return clf


def object_tuple() -> tuple:
    """(id, name, nicknames) for every object, hashable so the nickname vectors are built once."""
    return tuple((o.id, o.name, tuple(o.aliases)) for o in load_objects())


@asynccontextmanager
async def lifespan(_app: FastAPI):
    get_classifier()  # load at startup, not on the first upload
    from app.nlp.navigator import alias_table
    from app.nlp.retriever import index_ready, load_index

    alias_table(object_tuple())  # loads MiniLM and embeds every nickname once
    if index_ready():
        load_index()
    else:
        log.warning("no chat index: run ml/scripts/build_index.py")
    yield


app = FastAPI(title="AstroLens API", version="0.3.0", lifespan=lifespan)

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
    clf = get_classifier()
    return HealthResponse(status="ok", objects=len(load_objects()), model=clf.name if clf else None)


@app.get("/objects", response_model=list[SpaceObject])
def objects() -> list[SpaceObject]:
    return load_objects()


def read_image(file: UploadFile) -> Image.Image:
    """Check the upload and open it as an image, or raise an HTTP error with a clear message."""
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(415, f"That file is not an image ({file.content_type}). Please upload a JPEG, PNG or WebP photo.")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "That image is larger than 8 MB. Please upload a smaller photo.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    try:
        image = Image.open(io.BytesIO(data))
    except UnidentifiedImageError:
        raise HTTPException(415, "That file is not an image. Please upload a JPEG, PNG or WebP photo.") from None
    if image.width * image.height > MAX_PIXELS:
        raise HTTPException(413, "That image has too many pixels. Please upload a smaller photo.")
    try:
        image.load()
        image = ImageOps.exif_transpose(image)  # phone photos store "which way is up" separately
    except (OSError, Image.DecompressionBombError, SyntaxError, ValueError):
        raise HTTPException(400, "The image could not be read; it may be damaged.") from None
    return image.convert("RGB")


@app.post(
    "/classify",
    response_model=ClassifyResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse},
               415: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def classify(file: UploadFile = File(...)) -> ClassifyResponse:
    """Top 3 guesses for an uploaded photo, whether it is 'unknown', and a Grad-CAM heatmap."""
    image = read_image(file)
    clf = get_classifier()
    if clf is None:
        raise HTTPException(503, "The classifier is not loaded on the server.")
    start = time.perf_counter()
    top, gradcam = clf.classify(image)
    latency_ms = round((time.perf_counter() - start) * 1000, 1)
    names = {o.id: o.name for o in load_objects()}
    unknown = clf.is_unknown(top)
    log.info("classify: %s %.2f%s in %.0f ms", top[0][0], top[0][1], " (unknown)" if unknown else "", latency_ms)
    return ClassifyResponse(
        top3=[Guess(id=c, name=names[c], prob=round(p, 4)) for c, p in top],
        is_unknown=unknown,
        threshold=clf.threshold,
        known_classes=len(clf.classes),
        gradcam_png_base64=gradcam,
        latency_ms=latency_ms,
    )


@app.post("/chat", response_model=ChatResponse, responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
def chat(req: ChatRequest) -> ChatResponse:
    """Answer a question from the collected texts only, with numbered sources."""
    from app.nlp.chat import ChatUnavailable, answer_question
    from app.nlp.retriever import index_ready

    start = time.perf_counter()
    names = {o.id: o.name for o in load_objects()}
    if req.object_id is not None and req.object_id not in names:
        raise HTTPException(400, f"Unknown object '{req.object_id}'.")
    if not index_ready():
        raise HTTPException(503, "The chat's search index is not built on the server.")
    try:
        result = answer_question(req.message.strip(), req.object_id, names.get(req.object_id),
                                 [t.model_dump() for t in req.history])
    except ChatUnavailable as err:
        raise HTTPException(503, str(err)) from None
    latency_ms = round((time.perf_counter() - start) * 1000, 1)
    log.info("chat: %s | refused=%s | search %.0f ms, model %.0f ms", req.object_id, result["refused"],
             result["retrieval_ms"], result["llm_ms"])
    return ChatResponse(**result, latency_ms=latency_ms)


@app.post("/navigate", response_model=NavigateResponse)
def navigate(req: NavigateRequest) -> NavigateResponse:
    """Match typed text to an object's name or nickname: fly there, ask which one, or hand over to the chat."""
    from app.nlp.navigator import navigate as match

    start = time.perf_counter()
    names = {o.id: o.name for o in load_objects()}
    result = match(req.text, object_tuple())
    latency_ms = round((time.perf_counter() - start) * 1000, 1)
    return NavigateResponse(
        intent=result["intent"],
        object_id=result["object_id"],
        score=result["score"],
        needs_clarification=result["intent"] == "clarify",
        candidates=[Candidate(id=c["id"], name=names[c["id"]], score=c["score"]) for c in result["candidates"]],
        latency_ms=latency_ms,
    )
