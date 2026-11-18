"""Deploy the API server to a Hugging Face Space (Docker).

1. Reads HF_TOKEN from .env (never printed).
2. Creates the public Space <your username>/astrolens if it does not exist yet.
3. Uploads only what the server needs: the Dockerfile, the Space README, the lock file, backend/app
   (code, objects.json, classifier.json, the chat texts and index), the classifier weights and, when the
   index was built with it, the fine-tuned search model (backend/weights/minilm-astro).
   Nothing else from the project (no .env, no raw images, no other weights).
4. Optionally sets ALLOWED_ORIGINS (the page's address) as a Space variable.
5. With --wait, follows the build until the Space runs, and prints the build log if it fails.

The Groq key is NOT uploaded: add it yourself in the Space's Settings -> Variables and secrets
as a secret named GROQ_API_KEY.

Usage (from the project root):
    python deploy/push_space.py                                   # upload and build
    python deploy/push_space.py --wait                            # ... and wait for it to run
    python deploy/push_space.py --origins https://x.vercel.app    # set the page's address
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]
SPACE_NAME = "astrolens"
WAIT_MINUTES = 25


def stage_files(target: Path) -> list[str]:
    """Copy the files the Space needs into `target`; return their relative paths."""
    config = json.loads((ROOT / "backend" / "app" / "data" / "classifier.json").read_text(encoding="utf-8"))
    weights = ROOT / "backend" / "weights" / config["weights_file"]
    if not weights.exists():
        sys.exit(f"Missing {weights}; run ml/scripts/train.py first.")
    for name in ("Dockerfile", "README.md", "requirements.lock"):
        shutil.copy2(ROOT / "deploy" / "space" / name, target / name)
    shutil.copytree(ROOT / "backend" / "app", target / "backend" / "app",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (target / "backend" / "weights").mkdir(parents=True)
    shutil.copy2(weights, target / "backend" / "weights" / weights.name)
    index_model = json.loads((ROOT / "backend" / "app" / "data" / "index" / "model.json").read_text(encoding="utf-8"))
    if index_model["model"] == "fine-tuned":  # the index was built with it, so the server must load the same one
        finetuned = ROOT / "backend" / "weights" / "minilm-astro"
        if not finetuned.exists():
            sys.exit(f"Missing {finetuned}; run ml/scripts/finetune_embedder.py first.")
        shutil.copytree(finetuned, target / "backend" / "weights" / "minilm-astro")
    return sorted(str(p.relative_to(target)).replace("\\", "/") for p in target.rglob("*") if p.is_file())


def wait_for_build(api: HfApi, repo_id: str) -> str:
    start = time.time()
    last = None
    while time.time() - start < WAIT_MINUTES * 60:
        stage = api.get_space_runtime(repo_id).stage
        if stage != last:
            print(f"  {time.strftime('%H:%M:%S')} {stage}", flush=True)
            last = stage
        if stage in ("RUNNING", "BUILD_ERROR", "RUNTIME_ERROR", "CONFIG_ERROR", "NO_APP_FILE"):
            return stage
        time.sleep(15)
    return "TIMEOUT"


def print_logs(repo_id: str, token: str, kind: str = "build", max_lines: int = 60) -> None:
    """The last lines of the Space's build or run log."""
    import httpx

    lines: list[str] = []
    try:
        with httpx.stream("GET", f"https://huggingface.co/api/spaces/{repo_id}/logs/{kind}",
                          headers={"Authorization": f"Bearer {token}"}, timeout=20) as r:
            for line in r.iter_lines():
                if line.startswith("data:"):
                    try:
                        lines.append(json.loads(line[5:]).get("data", "").rstrip())
                    except json.JSONDecodeError:
                        pass
    except httpx.ReadTimeout:
        pass  # the log stream stays open; whatever arrived is enough
    print("\n".join(lines[-max_lines:]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", action="store_true", help="follow the build until the Space runs")
    ap.add_argument("--origins", help="comma-separated page addresses allowed to call the API (CORS)")
    ap.add_argument("--logs", choices=["build", "run"], help="only print the Space's build or run log")
    args = ap.parse_args()

    load_dotenv(ROOT / ".env")
    token = os.getenv("HF_TOKEN", "").strip()
    if not token:
        sys.exit("HF_TOKEN is empty: add a Hugging Face write token to .env (see .env.example).")
    api = HfApi(token=token)
    user = api.whoami()["name"]
    repo_id = f"{user}/{SPACE_NAME}"

    if args.logs:
        print_logs(repo_id, token, args.logs)
        return

    api.create_repo(repo_id, repo_type="space", space_sdk="docker", private=False, exist_ok=True)
    if args.origins:
        api.add_space_variable(repo_id, "ALLOWED_ORIGINS", args.origins)
        print(f"ALLOWED_ORIGINS set to {args.origins}")

    with tempfile.TemporaryDirectory() as tmp:
        files = stage_files(Path(tmp))
        print(f"Uploading {len(files)} files to https://huggingface.co/spaces/{repo_id}")
        api.upload_folder(folder_path=tmp, repo_id=repo_id, repo_type="space",
                          commit_message="Deploy AstroLens API", delete_patterns=["backend/**"])

    host = f"https://{repo_id.replace('/', '-').replace('_', '-').replace('.', '-').lower()}.hf.space"
    print(f"Space: https://huggingface.co/spaces/{repo_id}\nAPI:   {host}")
    if args.wait:
        stage = wait_for_build(api, repo_id)
        print(f"Final stage: {stage}")
        if stage != "RUNNING":
            print_logs(repo_id, token, "build" if "BUILD" in stage else "run")
            sys.exit(1)


if __name__ == "__main__":
    main()
