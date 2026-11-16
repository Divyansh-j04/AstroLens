# AstroLens API server for a Hugging Face Space (Docker, free CPU hardware).
# Built by Hugging Face from the files deploy/push_space.py uploads:
#   Dockerfile, README.md, requirements.lock, backend/app/** and backend/weights/<the app's model>.pt
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HOME=/home/user/.cache/huggingface

# Hugging Face runs the container as user 1000.
RUN useradd -m -u 1000 user
WORKDIR /home/user/app

# 1. PyTorch, CPU build (about 200 MB instead of the 2 GB GPU build); its helpers come from the lock file.
# 2. Everything else at the exact versions tested locally, binary wheels only.
COPY requirements.lock .
RUN pip install --no-deps --only-binary=:all: torch==2.8.0 torchvision==0.23.0 \
        --index-url https://download.pytorch.org/whl/cpu \
 && pip install --only-binary=:all: -r requirements.lock \
 && pip check

COPY --chown=user backend/ backend/
USER user

# Download the pinned MiniLM model now, so the server starts without fetching it.
RUN cd backend && python -c "from app.nlp.embedder import get_model; get_model()"

EXPOSE 7860
# ALLOWED_ORIGINS (the page's address) is set as a Space variable; GROQ_API_KEY as a Space secret.
CMD ["sh", "-c", "cd backend && exec uvicorn app.main:app --host 0.0.0.0 --port 7860"]
